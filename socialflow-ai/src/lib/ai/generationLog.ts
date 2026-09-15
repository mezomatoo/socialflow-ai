/**
 * AiGeneration kaydı (§39)
 * ---------------------------------------------------------------------------
 * Her yapay zekâ çağrısı (başarılı ya da başarısız) veritabanına yazılır:
 * sağlayıcı, model, platform, süre, durum ve uyarılar. Böylece:
 *   - maliyet/kalite analizi yapılabilir,
 *   - bir içeriğin hangi üretimlerle oluştuğu izlenebilir (denetim — §72),
 *   - sağlayıcı kesintileri görünür olur (§73).
 *
 * GİZLİ BİLGİ SAKLANMAZ: anahtar, token veya ham istem metni yazılmaz; yalnızca
 * istemin SHA-256 özeti tutulur.
 */
import crypto from 'crypto';
import prisma from '../prisma';
import { logger } from '../observability';
import type { AiProviderName } from './provider';

export type AiGenerationType =
  | 'ADAPT_CAPTION'
  | 'GENERATE_CAPTION'
  | 'HASHTAGS'
  | 'SPELLCHECK'
  | 'PUBLISHING_TIME'
  | 'STORY_TEXT';

export type AiGenerationStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface GenerationLogInput {
  workspaceId: string;
  contentId?: string | null;
  brandId?: string | null;
  userId?: string | null;
  type: AiGenerationType;
  provider: AiProviderName;
  model?: string | null;
  platform?: string | null;
  contentType?: string | null;
  /** Ham istem (prompt) — yalnızca özeti saklanır. */
  prompt?: string | null;
  status: AiGenerationStatus;
  errorCode?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}

export function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 64);
}

/** Üretim kaydını yazar. Hata durumunda ana akışı ASLA bozmaz. */
export async function recordGeneration(input: GenerationLogInput): Promise<void> {
  try {
    await prisma.aiGeneration.create({
      data: {
        workspaceId: input.workspaceId,
        contentId: input.contentId ?? null,
        brandId: input.brandId ?? null,
        userId: input.userId ?? null,
        type: input.type,
        provider: input.provider,
        model: input.model ?? null,
        platform: input.platform ?? null,
        contentType: input.contentType ?? null,
        inputHash: input.prompt ? hashPrompt(input.prompt) : null,
        status: input.status,
        errorCode: input.errorCode ?? null,
        durationMs: input.durationMs ?? null,
        metadata: JSON.stringify(input.metadata ?? {})
      }
    });
  } catch (error) {
    logger.warn({ event: 'ai.generation_log_failed', errorMessage: error instanceof Error ? error.message : String(error) });
  }
}

/** Bir içeriğin yapay zekâ üretim geçmişi (denetim/şeffaflık ekranı için). */
export async function listGenerations(workspaceId: string, contentId: string, take = 20) {
  return prisma.aiGeneration.findMany({
    where: { workspaceId, contentId },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      type: true,
      provider: true,
      model: true,
      platform: true,
      contentType: true,
      status: true,
      durationMs: true,
      createdAt: true
    }
  });
}
