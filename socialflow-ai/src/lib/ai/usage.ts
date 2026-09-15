/**
 * PHASE 4 — AI Kullanım ve Maliyet Takibi (§109-§112)
 * ------------------------------------------------------
 * Her AI çağrısı AiUsage kaydı oluşturur. Workspace bazlı aylık limitler desteklenir.
 * Limit aşıldığında kullanıcıya Türkçe mesaj gösterilir fakat uygulamanın normal
 * akışı (manuel içerik, yayınlama, analizler) kesintisiz çalışmaya devam eder.
 */

export interface AiUsageRecord {
  id: string;
  workspaceId: string;
  userId?: string | null;
  brandId?: string | null;
  provider: string;
  service: 'textGeneration' | 'imageGeneration' | 'imageEditing' | 'videoProcessing' | 'transcription' | 'embeddings';
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

// Mock in-memory usage — gerçekte DB (AiUsage) ve AppSettings limitleri.
const mockUsage: AiUsageRecord[] = [];

export async function trackUsage(input: Omit<AiUsageRecord, 'id' | 'createdAt'>): Promise<AiUsageRecord> {
  const rec: AiUsageRecord = { id: `use-${Date.now()}`, createdAt: new Date().toISOString(), ...input };
  mockUsage.push(rec);
  return rec;
}

export async function getUsageSummary(workspaceId: string, period: 'today' | 'month' = 'month'): Promise<{ totalCost: number; totalImages: number; totalTokens: number; records: AiUsageRecord[] }> {
  const now = new Date();
  const filtered = mockUsage.filter((r) => r.workspaceId === workspaceId && (period === 'today' ? new Date(r.createdAt).toDateString() === now.toDateString() : new Date(r.createdAt).getMonth() === now.getMonth()));
  return {
    records: filtered,
    totalCost: filtered.reduce((s, r) => s + r.costUSD, 0),
    totalImages: filtered.reduce((s, r) => s + r.imageCount, 0),
    totalTokens: filtered.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0),
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

export function estimateCost(service: AiUsageRecord['service'], amount: number): number {
  const rates: Record<string, number> = { textGeneration: 0.002, imageGeneration: 0.04, imageEditing: 0.02, videoProcessing: 0.1, transcription: 0.006, embeddings: 0.0001 };
  return (rates[service] ?? 0.01) * amount;
}

export const AI_LIMIT_MESSAGE = 'Bu ay için AI kullanım limitine ulaştınız.';
