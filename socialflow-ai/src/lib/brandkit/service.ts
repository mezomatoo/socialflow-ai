import prisma from '../prisma';
import type { Prisma } from '@prisma/client';
import { brandKitInclude, type BrandKitAggregate } from './types';
import { computeCompleteness } from './completeness';
import { LOCK_MODES, CONSISTENCY_GATES, type LockMode, type ConsistencyGate } from './constants';

/**
 * PHASE 4 — Brand Kit servis katmanı
 * ---------------------------------------------------------------------------
 * Tüm işlemler workspaceId ile YALITILMIŞTIR (§134 çoklu-marka izolasyonu).
 * Bu katman mevcut Brand/BrandVoice/MediaAsset sistemlerini GENİŞLETİR; onları
 * değiştirmez veya kopyalamaz. ensureBrandKit, mevcut marka verisini zengin
 * Brand Kit modellerine backfill eder (additive, asla üzerine yazmaz).
 */

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Brand'in basit alanlarını zengin Brand Kit koleksiyonlarına backfill eder. */
async function backfillFromBrand(brandId: string, brandKitId: string, workspaceId: string) {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, include: { voice: true } });
  if (!brand) return;

  const counts = await prisma.$transaction([
    prisma.brandColor.count({ where: { brandKitId } }),
    prisma.brandTypography.count({ where: { brandKitId } }),
    prisma.brandCTA.count({ where: { brandKitId } }),
    prisma.brandHashtag.count({ where: { brandKitId } }),
    prisma.brandMention.count({ where: { brandKitId } }),
    prisma.brandLogo.count({ where: { brandKitId } })
  ]);
  const [colorCount, typoCount, ctaCount, hashCount, mentionCount, logoCount] = counts;

  // Renkler: Brand.primaryColor/secondaryColor → BrandColor
  if (colorCount === 0) {
    const colors: Prisma.BrandColorCreateManyInput[] = [];
    if (brand.primaryColor) {
      colors.push({ workspaceId, brandId, brandKitId, name: 'Birincil Renk', hex: brand.primaryColor, category: 'PRIMARY', priority: 1, approvalStatus: 'APPROVED', order: 0 });
    }
    if (brand.secondaryColor) {
      colors.push({ workspaceId, brandId, brandKitId, name: 'İkincil Renk', hex: brand.secondaryColor, category: 'SECONDARY', priority: 2, approvalStatus: 'APPROVED', order: 1 });
    }
    if (colors.length) await prisma.brandColor.createMany({ data: colors });
  }

  // Tipografi: Brand.fontStyle → HEADING + BODY
  if (typoCount === 0 && brand.fontStyle) {
    await prisma.brandTypography.createMany({
      data: [
        { workspaceId, brandId, brandKitId, role: 'HEADING', fontFamily: brand.fontStyle, approvalStatus: 'APPROVED', order: 0 },
        { workspaceId, brandId, brandKitId, role: 'BODY', fontFamily: brand.fontStyle, approvalStatus: 'APPROVED', order: 1 }
      ]
    });
  }

  // CTA: Brand.defaultCta → PREFERRED
  if (ctaCount === 0 && brand.defaultCta) {
    await prisma.brandCTA.create({
      data: { workspaceId, brandId, brandKitId, text: brand.defaultCta, category: 'PREFERRED', isPreferred: true, approvalStatus: 'APPROVED', order: 0 }
    });
  }

  // Hashtag'ler: default/required/banned → BrandHashtag
  if (hashCount === 0) {
    const rows: Prisma.BrandHashtagCreateManyInput[] = [];
    let order = 0;
    for (const t of parseList(brand.defaultHashtags)) rows.push({ workspaceId, brandId, brandKitId, tag: t.replace(/^#/, ''), category: 'DEFAULT', approvalStatus: 'APPROVED', order: order++ });
    for (const t of parseList(brand.requiredHashtags)) rows.push({ workspaceId, brandId, brandKitId, tag: t.replace(/^#/, ''), category: 'REQUIRED', approvalStatus: 'APPROVED', order: order++ });
    for (const t of parseList(brand.bannedHashtags)) rows.push({ workspaceId, brandId, brandKitId, tag: t.replace(/^#/, ''), category: 'BANNED', approvalStatus: 'APPROVED', order: order++ });
    if (rows.length) await prisma.brandHashtag.createMany({ data: rows });
  }

  // Mention'lar: Brand.defaultMentions → BrandMention
  if (mentionCount === 0) {
    const rows = parseList(brand.defaultMentions).map((h, i) => ({
      workspaceId, brandId, brandKitId, handle: h.startsWith('@') ? h : `@${h}`, type: 'OFFICIAL', approvalStatus: 'APPROVED', order: i
    }));
    if (rows.length) await prisma.brandMention.createMany({ data: rows });
  }

  // Logo: Brand.logoUrl → PRIMARY BrandLogo
  if (logoCount === 0 && brand.logoUrl) {
    await prisma.brandLogo.create({
      data: { workspaceId, brandId, brandKitId, usageType: 'PRIMARY', name: 'Birincil Logo', fileUrl: brand.logoUrl, isPrimary: true, approvalStatus: 'APPROVED', order: 0 }
    });
  }
}

/** Brand Kit scalar alanları için güncellenebilir beyaz liste. */
const EDITABLE_KIT_FIELDS = [
  'status', 'lockMode', 'strictMode', 'consistencyGate', 'learnFromApproved',
  'shortName', 'legalName', 'mainSlogan', 'subSlogan', 'longDescription', 'shortDescription',
  'industry', 'subIndustry', 'foundedYear', 'country', 'mainMarket', 'targetMarkets',
  'mainLanguage', 'supportedLanguages',
  'phone', 'email', 'whatsapp', 'address', 'supportLine', 'workingHours'
] as const;

export type EditableKitField = (typeof EDITABLE_KIT_FIELDS)[number];

/**
 * Brand Kit'i tembel olarak oluşturur (idempotent) ve mevcut marka verisini
 * backfill eder. Brand workspace'e ait değilse null döner (izolasyon).
 */
export async function ensureBrandKit(input: {
  workspaceId: string;
  brandId: string;
}): Promise<BrandKitAggregate | null> {
  const brand = await prisma.brand.findFirst({
    where: { id: input.brandId, workspaceId: input.workspaceId },
    select: { id: true, workspaceId: true, name: true, description: true }
  });
  if (!brand) return null;

  const existing = await prisma.brandKit.findUnique({ where: { brandId: brand.id }, select: { id: true } });

  if (!existing) {
    await prisma.brandKit.create({
      data: {
        workspaceId: brand.workspaceId,
        brandId: brand.id,
        longDescription: brand.description ?? undefined,
        targetMarkets: '[]',
        supportedLanguages: '["tr"]'
      }
    });
  }

  const kit = await prisma.brandKit.findUniqueOrThrow({ where: { brandId: brand.id } });
  await backfillFromBrand(brand.id, kit.id, brand.workspaceId);
  await recomputeCompleteness(kit.id);

  return getBrandKit({ workspaceId: input.workspaceId, brandId: brand.id });
}

/** Workspace-yalıtımlı tam Brand Kit aggregate'i. Yoksa null. */
export async function getBrandKit(input: {
  workspaceId: string;
  brandId: string;
}): Promise<BrandKitAggregate | null> {
  return prisma.brandKit.findFirst({
    where: { brandId: input.brandId, workspaceId: input.workspaceId },
    include: brandKitInclude
  });
}

/** Workspace'teki tüm markalar + (varsa) kit özeti + doluluk skoru. */
export async function listBrandKitsForWorkspace(workspaceId: string) {
  const brands = await prisma.brand.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
    include: { brandKit: { select: { id: true, status: true, completenessScore: true, lockMode: true, currentVersion: true, updatedAt: true } } }
  });
  return brands.map((b) => ({
    brandId: b.id,
    name: b.name,
    slug: b.slug,
    logoUrl: b.logoUrl,
    primaryColor: b.primaryColor,
    hasKit: !!b.brandKit,
    kit: b.brandKit
      ? {
          id: b.brandKit.id,
          status: b.brandKit.status,
          completenessScore: b.brandKit.completenessScore,
          lockMode: b.brandKit.lockMode,
          currentVersion: b.brandKit.currentVersion,
          updatedAt: b.brandKit.updatedAt
        }
      : null
  }));
}

/** Doluluk skorunu hesaplar ve kalıcı olarak yazar. */
export async function recomputeCompleteness(brandKitId: string): Promise<number> {
  const kit = await prisma.brandKit.findUnique({
    where: { id: brandKitId },
    include: brandKitInclude
  });
  if (!kit) return 0;
  const { score } = computeCompleteness(kit);
  await prisma.brandKit.update({ where: { id: brandKitId }, data: { completenessScore: score } });
  return score;
}

/** Beyaz listedeki scalar alanları günceller; lockMode↔strictMode'u hizalar. */
export async function updateBrandKit(
  input: { workspaceId: string; brandId: string },
  data: Partial<Record<EditableKitField, unknown>>
): Promise<BrandKitAggregate | null> {
  const kit = await prisma.brandKit.findFirst({
    where: { brandId: input.brandId, workspaceId: input.workspaceId },
    select: { id: true }
  });
  if (!kit) return null;

  const clean: Prisma.BrandKitUpdateInput = {};
  for (const key of EDITABLE_KIT_FIELDS) {
    if (key in data && data[key] !== undefined) {
      (clean as Record<string, unknown>)[key] = data[key];
    }
  }

  // Kilit tutarlılığı
  if (typeof clean.lockMode === 'string') {
    if (!LOCK_MODES.includes(clean.lockMode as LockMode)) delete clean.lockMode;
    else clean.strictMode = clean.lockMode === 'STRICT';
  }
  if (typeof clean.consistencyGate === 'string' && !CONSISTENCY_GATES.includes(clean.consistencyGate as ConsistencyGate)) {
    delete clean.consistencyGate;
  }

  await prisma.brandKit.update({ where: { id: kit.id }, data: clean });
  await recomputeCompleteness(kit.id);
  return getBrandKit(input);
}

/**
 * Yeni bir sürüm oluşturur: kitin tam JSON anlık görüntüsünü kaydeder ve
 * currentVersion'ı artırır (§45/§46). Atomik transaction.
 */
export async function createBrandKitVersion(input: {
  workspaceId: string;
  brandId: string;
  note?: string;
  label?: string;
  createdBy?: string;
}): Promise<{ version: number } | null> {
  const kit = await getBrandKit(input);
  if (!kit) return null;

  const newVersion = kit.currentVersion + 1;
  const snapshot = JSON.stringify({
    savedAt: new Date().toISOString(),
    kit: {
      status: kit.status,
      lockMode: kit.lockMode,
      consistencyGate: kit.consistencyGate,
      learnFromApproved: kit.learnFromApproved,
      shortName: kit.shortName,
      legalName: kit.legalName,
      mainSlogan: kit.mainSlogan,
      industry: kit.industry
    },
    counts: {
      logos: kit.logos.length,
      colors: kit.colors.length,
      typography: kit.typography.length,
      messages: kit.messages.length,
      ctas: kit.ctas.length,
      hashtags: kit.hashtags.length,
      mentions: kit.mentions.length,
      visualRules: kit.visualRules.length,
      platformRules: kit.platformRules.length,
      legalRules: kit.legalRules.length,
      assets: kit.assets.length,
      references: kit.references.length,
      memories: kit.memories.length
    },
    colors: kit.colors.map((c) => ({ name: c.name, hex: c.hex, category: c.category, prohibited: c.prohibited })),
    logos: kit.logos.map((l) => ({ usageType: l.usageType, name: l.name, isPrimary: l.isPrimary })),
    typography: kit.typography.map((t) => ({ role: t.role, fontFamily: t.fontFamily })),
    messages: kit.messages.map((m) => ({ type: m.type, text: m.text })),
    ctas: kit.ctas.map((c) => ({ text: c.text, category: c.category })),
    hashtags: kit.hashtags.map((h) => ({ tag: h.tag, category: h.category })),
    legalRules: kit.legalRules.map((l) => ({ category: l.category, key: l.key, value: l.value }))
  });

  await prisma.$transaction([
    prisma.brandKitVersion.create({
      data: {
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        brandKitId: kit.id,
        version: newVersion,
        label: input.label ?? `v${newVersion}`,
        note: input.note ?? null,
        snapshot,
        createdBy: input.createdBy ?? null
      }
    }),
    prisma.brandKit.update({ where: { id: kit.id }, data: { currentVersion: newVersion } })
  ]);

  return { version: newVersion };
}

/** Sürüm geçmişini (yeni→eski) döner. */
export async function listBrandKitVersions(input: { workspaceId: string; brandId: string }, take = 50) {
  return prisma.brandKitVersion.findMany({
    where: { brandId: input.brandId, workspaceId: input.workspaceId },
    orderBy: { version: 'desc' },
    take,
    select: { id: true, version: true, label: true, note: true, createdBy: true, createdAt: true }
  });
}
