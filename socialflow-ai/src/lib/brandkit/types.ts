import type { Prisma } from '@prisma/client';

/**
 * PHASE 4 — Brand Kit paylaşılan tipleri
 * ---------------------------------------------------------------------------
 * `brandKitInclude`, bir Brand Kit'in TÜM alt koleksiyonlarını + ilişkili Brand
 * ve BrandVoice'u tek sorguda çeker. Aggregate tipi bundan türetilir; servis,
 * API ve UI aynı tipi kullanır (tip güvenliği + tek doğruluk kaynağı).
 *
 * Sürümler (versions) bilinçli olarak DAHİL DEĞİLDİR: büyük olabileceği için
 * ayrı bir uçtan (GET .../versions) sayfalı yüklenir.
 */
export const brandKitInclude = {
  brand: { include: { voice: true } },
  logos: { orderBy: { order: 'asc' } },
  colors: { orderBy: { order: 'asc' } },
  typography: { orderBy: { order: 'asc' } },
  messages: { orderBy: { order: 'asc' } },
  ctas: { orderBy: { order: 'asc' } },
  hashtags: { orderBy: { order: 'asc' } },
  mentions: { orderBy: { order: 'asc' } },
  visualRules: { orderBy: { order: 'asc' } },
  platformRules: { orderBy: { order: 'asc' } },
  legalRules: { orderBy: { order: 'asc' } },
  assets: { orderBy: { order: 'asc' } },
  references: { orderBy: { order: 'asc' } },
  memories: { orderBy: { createdAt: 'desc' } }
} as const satisfies Prisma.BrandKitInclude;

export type BrandKitAggregate = Prisma.BrandKitGetPayload<{ include: typeof brandKitInclude }>;

/** Marka kilidinin AI/otomasyon üzerinde düzenlemeye izin verip vermediği. */
export function isKitEditableByAi(lockMode: string): boolean {
  // STRICT: AI/otomasyon mark kitini değiştiremez. STANDARD/OFF: değiştirebilir
  // (ancak her durumda AI asla kendiliğinden yayınlamaz/onaylamaz — § Phase 4).
  return lockMode !== 'STRICT';
}
