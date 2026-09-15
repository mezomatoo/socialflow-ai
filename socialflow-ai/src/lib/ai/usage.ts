/**
 * PHASE 4 — AI Kullanım ve Maliyet Takibi (§57)
 * ------------------------------------------------------
 * Her AI çağrısı AiUsage tablosuna yazılır (gerçek DB kaydı; in-memory mock
 * değildir). Workspace bazlı aylık limitler desteklenir. Limit aşıldığında
 * kullanıcıya Türkçe mesaj gösterilir fakat uygulamanın normal akışı
 * (manuel içerik, yayınlama, analizler) kesintisiz çalışmaya devam eder (§106).
 *
 * KAYIT HATASI ASLA ANA AKIŞI BOZMAZ: trackUsage yalnızca loglar.
 */
import prisma from '../prisma';
import { logger } from '../observability';

export type AiUsageService =
  | 'textGeneration'
  | 'imageGeneration'
  | 'imageEditing'
  | 'videoProcessing'
  | 'transcription'
  | 'embeddings';

export interface AiUsageRecord {
  id: string;
  workspaceId: string;
  userId?: string | null;
  brandId?: string | null;
  provider: string;
  service: AiUsageService;
  task?: string | null;
  tokensIn: number;
  tokensOut: number;
  imageCount: number;
  durationMs: number;
  costUSD: number;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface AiLimits {
  monthlyBudgetUSD?: number | null;
  monthlyImageLimit?: number | null;
  monthlyVideoLimit?: number | null;
  monthlyTextTokens?: number | null;
}

export interface TrackUsageInput {
  workspaceId: string;
  userId?: string | null;
  brandId?: string | null;
  provider: string;
  service: AiUsageService;
  task?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  imageCount?: number;
  durationMs?: number;
  costUSD?: number;
  meta?: Record<string, unknown>;
}

/** Metinden kaba belirteç tahmini (~4 karakter/token). Etiketi meta'da işaretlenir. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text ?? '').length / 4));
}

export async function trackUsage(input: TrackUsageInput): Promise<void> {
  try {
    await prisma.aiUsage.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId ?? null,
        brandId: input.brandId ?? null,
        provider: input.provider,
        service: input.service,
        task: input.task ?? null,
        tokensIn: input.tokensIn ?? 0,
        tokensOut: input.tokensOut ?? 0,
        imageCount: input.imageCount ?? 0,
        durationMs: input.durationMs ?? 0,
        costUSD: input.costUSD ?? 0,
        meta: JSON.stringify(input.meta ?? {})
      }
    });
  } catch (error) {
    // Kullanım kaydı yazılamazsa ana akış bozulmaz (§106 izolasyon).
    logger.warn({ event: 'ai.usage_record_failed', errorMessage: error instanceof Error ? error.message : String(error) });
  }
}

export interface UsageSummary {
  totalCost: number;
  totalImages: number;
  totalTokens: number;
  records: {
    id: string;
    provider: string;
    service: string;
    task: string | null;
    tokensIn: number;
    tokensOut: number;
    imageCount: number;
    durationMs: number;
    costUSD: number;
    createdAt: string;
  }[];
}

function periodStart(period: 'today' | 'month'): Date {
  const now = new Date();
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function getUsageSummary(workspaceId: string, period: 'today' | 'month' = 'month'): Promise<UsageSummary> {
  const since = periodStart(period);
  const rows = await prisma.aiUsage.findMany({
    where: { workspaceId, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 500
  });
  return {
    records: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      service: r.service,
      task: r.task,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      imageCount: r.imageCount,
      durationMs: r.durationMs,
      costUSD: r.costUSD,
      createdAt: r.createdAt.toISOString()
    })),
    totalCost: rows.reduce((s, r) => s + r.costUSD, 0),
    totalImages: rows.reduce((s, r) => s + r.imageCount, 0),
    totalTokens: rows.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0)
  };
}

export function checkLimits(summary: { totalCost: number; totalImages: number }, limits: AiLimits): { exceeded: boolean; message?: string } {
  if (limits.monthlyBudgetUSD && summary.totalCost >= limits.monthlyBudgetUSD) {
    return { exceeded: true, message: 'Bu ay için AI kullanım limitine ulaştınız.' };
  }
  if (limits.monthlyImageLimit && summary.totalImages >= limits.monthlyImageLimit) {
    return { exceeded: true, message: 'Bu ay için AI görsel üretim limitine ulaştınız.' };
  }
  return { exceeded: false };
}

export function estimateCost(service: AiUsageService, amount: number): number {
  const rates: Record<string, number> = { textGeneration: 0.002, imageGeneration: 0.04, imageEditing: 0.02, videoProcessing: 0.1, transcription: 0.006, embeddings: 0.0001 };
  return (rates[service] ?? 0.01) * amount;
}

export const AI_LIMIT_MESSAGE = 'Bu ay için AI kullanım limitine ulaştınız.';
