/**
 * Ana Sayfa verileri — Faz 1 görünümü (§24)
 * ---------------------------------------------------------------------------
 * Faz 1'de yayınlama/analitik kapalıdır. Bu yüzden ana sayfa, YAYIN metrikleri
 * yerine üretim akışına odaklanır: taslaklar, hazır içerikler, uyarlanmış
 * hedefler, medya varlıkları, markalar ve platform dağılımı.
 *
 * Yayın/AI özetleri yalnızca ilgili modül açıkken hesaplanır; kapalıyken
 * hesaplanmaz ve arayüzde gösterilmez (sahte metrik yok).
 */
import prisma from '../prisma';
import { PLATFORM_META, type PlatformCode, PLATFORM_LIST } from '../platforms/platforms';
import { isModuleEnabled } from '../phase/phaseGates';

export const DRAFT_STATUSES = ['DRAFT', 'PROCESSING', 'READY', 'APPROVAL_PENDING'];

export interface Phase1Stats {
  contentsTotal: number;
  drafts: number;
  ready: number;
  archived: number;
  adaptedTargets: number;
  totalTargets: number;
  mediaAssets: number;
  mediaVariants: number;
  brands: number;
  platformDistribution: { platform: string; label: string; count: number; color: string }[];
  recentDrafts: {
    id: string;
    title: string;
    status: string;
    brandName: string | null;
    platformCount: number;
    adaptedCount: number;
    updatedAt: string;
  }[];
  lastGenerations: {
    id: string;
    type: string;
    provider: string;
    platform: string | null;
    status: string;
    createdAt: string;
    durationMs: number | null;
  }[];
  aiProvider: string;
  /** Bu kurulumda etkin olan modüller (arayüz hangi kartları göstereceğini bilir). */
  publishingEnabled: boolean;
  schedulingEnabled: boolean;
  accountsEnabled: boolean;
}

export async function getPhase1Stats(workspaceId: string): Promise<Phase1Stats> {
  const [
    contentsTotal,
    drafts,
    ready,
    archived,
    totalTargets,
    adaptedTargets,
    mediaAssets,
    mediaVariants,
    brands,
    platformContents,
    recent,
    generations
  ] = await Promise.all([
    prisma.content.count({ where: { workspaceId } }),
    prisma.content.count({ where: { workspaceId, status: 'DRAFT' } }),
    prisma.content.count({ where: { workspaceId, status: 'READY' } }),
    prisma.content.count({ where: { workspaceId, status: 'ARCHIVED' } }),
    prisma.platformContent.count({ where: { content: { workspaceId } } }),
    prisma.platformContent.count({ where: { content: { workspaceId }, captionSource: 'AI' } }),
    prisma.mediaAsset.count({ where: { workspaceId } }),
    prisma.mediaVariant.count({ where: { workspaceId } }),
    prisma.brand.count({ where: { workspaceId } }),
    prisma.platformContent.findMany({ where: { content: { workspaceId } }, select: { platform: true } }),
    prisma.content.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        brand: { select: { name: true } },
        platformContents: { select: { captionSource: true } }
      }
    }),
    prisma.aiGeneration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, type: true, provider: true, platform: true, status: true, createdAt: true, durationMs: true }
    })
  ]);

  const distMap = new Map<string, number>();
  for (const pc of platformContents) distMap.set(pc.platform, (distMap.get(pc.platform) ?? 0) + 1);
  const platformDistribution = Array.from(distMap.entries())
    .map(([platform, count]) => ({
      platform,
      label: PLATFORM_META[platform as PlatformCode]?.name ?? platform,
      count,
      color: PLATFORM_META[platform as PlatformCode]?.brandColor ?? '#64748b'
    }))
    .sort((a, b) => b.count - a.count);

  return {
    contentsTotal,
    drafts,
    ready,
    archived,
    adaptedTargets,
    totalTargets,
    mediaAssets,
    mediaVariants,
    brands,
    platformDistribution,
    recentDrafts: recent.map((c) => ({
      id: c.id,
      title: c.title ?? 'Başlıksız içerik',
      status: c.status,
      brandName: c.brand?.name ?? null,
      platformCount: c.platformContents.length,
      adaptedCount: c.platformContents.filter((p) => p.captionSource === 'AI' || p.captionSource === 'MANUAL').length,
      updatedAt: c.updatedAt.toISOString()
    })),
    lastGenerations: generations.map((g) => ({
      id: g.id,
      type: g.type,
      provider: g.provider,
      platform: g.platform,
      status: g.status,
      createdAt: g.createdAt.toISOString(),
      durationMs: g.durationMs
    })),
    aiProvider: process.env.AI_PROVIDER && (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) ? process.env.AI_PROVIDER : 'deterministic',
    publishingEnabled: isModuleEnabled('socialPublishing'),
    schedulingEnabled: isModuleEnabled('scheduling'),
    accountsEnabled: isModuleEnabled('socialAccounts')
  };
}

/** Platform logosu olmayan hedefler için güvenli etiket. */
export function platformLabel(code: string): string {
  return PLATFORM_META[code as PlatformCode]?.name ?? code;
}

/** Faz 1'de önerilen başlangıç adımları (boş durum yönlendirmesi — §26). */
export function phase1Onboarding(state: {
  brands: number;
  mediaAssets: number;
  contentsTotal: number;
  adaptedTargets: number;
}): { done: boolean; label: string; href: string; hint: string }[] {
  return [
    {
      done: state.brands > 0,
      label: 'Marka profili oluştur',
      href: '/app/markalar',
      hint: 'Marka sesi, yasaklı kelimeler ve zorunlu hashtagler buradan yönetilir.'
    },
    {
      done: state.mediaAssets > 0,
      label: 'Medya yükle',
      href: '/app/medya',
      hint: 'Orijinal dosyalar korunur; platform varyantları ayrı üretilir.'
    },
    {
      done: state.contentsTotal > 0,
      label: 'İlk içeriğini oluştur',
      href: '/app/icerik/yeni',
      hint: 'Tek bir ana açıklama yazın, platformları seçin.'
    },
    {
      done: state.adaptedTargets > 0,
      label: 'Platformlara uyarla',
      href: '/app/icerik/taslaklar',
      hint: 'Her platform için metin ayrı ayrı yeniden yazılır; bilgiler korunur.'
    }
  ];
}

export const SUPPORTED_PLATFORM_COUNT = PLATFORM_LIST.length;
