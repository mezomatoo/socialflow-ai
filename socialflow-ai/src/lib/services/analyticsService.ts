import prisma from '../prisma';
import { DEFAULT_TIMEZONE } from '../format';
import { PLATFORM_META, type PlatformCode } from '../platforms/platforms';

/**
 * AnalyticsService
 * ---------------------------------------------------------------------------
 * SAHTE ANALİTİK ÜRETMEZ.
 *  - "Yayın performansı" metrikleri yalnızca platform API'sinden gelen
 *    gerçek AnalyticsSnapshot kayıtlarından hesaplanır.
 *  - Demo modunda platform metrikleri "veri yok" olarak işaretlenir;
 *    buna karşılık sistemin kendi gerçek verileri (yayınlanan içerik sayısı,
 *    platform dağılımı, başarı/hata oranları) gösterilir.
 */

export interface DashboardStats {
  connectedAccounts: number;
  activeAccounts: number;
  needsReauth: number;
  publishingToday: number;
  scheduledTotal: number;
  publishedTotal: number;
  failedTotal: number;
  partiallyPublished: number;
  drafts: number;
  monthContents: number;
  platformDistribution: { platform: PlatformCode; label: string; count: number; color: string }[];
  upcoming: UpcomingItem[];
  todayPlan: TodayPlanItem[];
  hasRealMetrics: boolean;
  metricSampleSize: number;
  demoMode: boolean;
}

export interface UpcomingItem {
  id: string;
  platformContentId: string;
  contentId: string;
  platform: PlatformCode;
  platformName: string;
  color: string;
  contentType: string;
  label: string;
  account: string | null;
  scheduledFor: string;
  status: string;
  captionPreview: string;
  thumbnail: string | null;
}

export type TodayPlanItem = UpcomingItem;

export async function getDashboardStats(
  workspaceId: string,
  options: { timezone?: string; demoMode?: boolean } = {}
): Promise<DashboardStats> {
  const tz = options.timezone ?? DEFAULT_TIMEZONE;
  const now = new Date();

  const dayStart = startOfDay(now, tz);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [accounts, scheduledToday, scheduledAll, published, failed, partial, drafts, monthCount, platformContents] =
    await Promise.all([
      prisma.socialAccount.findMany({ where: { workspaceId }, select: { connectionStatus: true } }),
      prisma.platformContent.count({
        where: { content: { workspaceId }, status: 'SCHEDULED', scheduledFor: { gte: dayStart, lt: dayEnd } }
      }),
      prisma.platformContent.count({ where: { content: { workspaceId }, status: 'SCHEDULED' } }),
      prisma.platformContent.count({ where: { content: { workspaceId }, status: 'PUBLISHED' } }),
      prisma.platformContent.count({ where: { content: { workspaceId }, status: 'FAILED' } }),
      prisma.content.count({ where: { workspaceId, status: 'PARTIALLY_PUBLISHED' } }),
      prisma.content.count({ where: { workspaceId, status: 'DRAFT' } }),
      prisma.content.count({ where: { workspaceId, createdAt: { gte: monthStart } } }),
      prisma.platformContent.findMany({
        where: { content: { workspaceId }, enabled: true },
        select: { platform: true, status: true }
      })
    ]);

  const distMap = new Map<string, number>();
  for (const pc of platformContents) distMap.set(pc.platform, (distMap.get(pc.platform) ?? 0) + 1);
  const platformDistribution = Array.from(distMap.entries())
    .map(([platform, count]) => ({
      platform: platform as PlatformCode,
      label: PLATFORM_META[platform as PlatformCode]?.name ?? platform,
      count,
      color: PLATFORM_META[platform as PlatformCode]?.brandColor ?? '#64748b'
    }))
    .sort((a, b) => b.count - a.count);

  const upcoming = await getUpcoming(workspaceId, tz, 12);
  const todayPlan = await getTodayPlan(workspaceId, tz);

  const metricSampleSize = await prisma.analyticsSnapshot.count({ where: { workspaceId, source: 'API' } });

  return {
    connectedAccounts: accounts.length,
    activeAccounts: accounts.filter((a) => a.connectionStatus === 'ACTIVE').length,
    needsReauth: accounts.filter((a) => a.connectionStatus !== 'ACTIVE').length,
    publishingToday: scheduledToday,
    scheduledTotal: scheduledAll,
    publishedTotal: published,
    failedTotal: failed,
    partiallyPublished: partial,
    drafts,
    monthContents: monthCount,
    platformDistribution,
    upcoming,
    todayPlan,
    hasRealMetrics: metricSampleSize > 0,
    metricSampleSize,
    demoMode: options.demoMode ?? true
  };
}

export async function getUpcoming(workspaceId: string, tz = DEFAULT_TIMEZONE, limit = 12): Promise<UpcomingItem[]> {
  const rows = await prisma.platformContent.findMany({
    where: {
      content: { workspaceId },
      status: { in: ['SCHEDULED', 'PUBLISHING', 'APPROVAL_PENDING'] },
      scheduledFor: { gte: new Date(Date.now() - 3600_000) }
    },
    orderBy: { scheduledFor: 'asc' },
    take: limit,
    include: {
      socialAccount: { select: { displayName: true, handle: true } },
      mediaAsset: { select: { publicUrl: true } },
      content: { select: { id: true, title: true, masterCaption: true } }
    }
  });

  return rows.map((r) => toUpcomingItem(r));
}

export async function getTodayPlan(workspaceId: string, tz = DEFAULT_TIMEZONE): Promise<TodayPlanItem[]> {
  const dayStart = startOfDay(new Date(), tz);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);

  const rows = await prisma.platformContent.findMany({
    where: {
      content: { workspaceId },
      scheduledFor: { gte: dayStart, lt: dayEnd }
    },
    orderBy: { scheduledFor: 'asc' },
    include: {
      socialAccount: { select: { displayName: true, handle: true } },
      mediaAsset: { select: { publicUrl: true } },
      content: { select: { id: true, title: true, masterCaption: true } }
    }
  });
  return rows.map((r) => toUpcomingItem(r));
}

function toUpcomingItem(r: any): UpcomingItem {
  const meta = PLATFORM_META[r.platform as PlatformCode];
  return {
    id: r.id,
    platformContentId: r.id,
    contentId: r.content?.id ?? r.contentId ?? '',
    platform: r.platform,
    platformName: meta?.name ?? r.platform,
    color: meta?.brandColor ?? '#64748b',
    contentType: r.contentType,
    label: meta?.contentTypeLabels?.[r.contentType as keyof typeof meta.contentTypeLabels] ?? r.contentType,
    account: r.socialAccount ? `${r.socialAccount.displayName} ${r.socialAccount.handle}` : null,
    scheduledFor: r.scheduledFor ? new Date(r.scheduledFor).toISOString() : '',
    status: r.status,
    captionPreview: String(r.caption ?? r.content?.masterCaption ?? '').slice(0, 140),
    thumbnail: r.mediaAsset?.publicUrl ?? null
  };
}

function startOfDay(date: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '01';
  // tz=Europe/Istanbul → UTC+3
  const localMidnight = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')), 0, 0, 0);
  const offset = offsetMsForTz(date, tz);
  return new Date(localMidnight - offset);
}

export function offsetMsForTz(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - date.getTime();
}

export interface MetricSummary {
  hasData: boolean;
  note: string;
  totals: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    videoViews: number;
    engagementRate: number;
    followerDelta: number;
  };
  byPlatform: { platform: PlatformCode; label: string; color: string; impressions: number; engagement: number; engagementRate: number }[];
  series: { date: string; impressions: number; engagement: number }[];
  bestContent: { id: string; caption: string; platform: string; impressions: number; engagementRate: number }[];
}

export async function getMetricSummary(
  workspaceId: string,
  options: { days?: number; platform?: string; brandId?: string; campaignId?: string } = {}
): Promise<MetricSummary> {
  const days = options.days ?? 30;
  const from = new Date(Date.now() - days * 24 * 3600_000);

  const rows = await prisma.analyticsSnapshot.findMany({
    where: {
      workspaceId,
      date: { gte: from },
      source: 'API',
      ...(options.platform ? { platform: options.platform } : {}),
      ...(options.brandId ? { brandId: options.brandId } : {}),
      ...(options.campaignId ? { campaignId: options.campaignId } : {})
    },
    include: { platformContent: { select: { id: true, caption: true, platform: true } } }
  });

  const empty: MetricSummary['totals'] = {
    impressions: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    clicks: 0,
    videoViews: 0,
    engagementRate: 0,
    followerDelta: 0
  };

  if (!rows.length) {
    return {
      hasData: false,
      note: `Son ${days} gün için platform API'sinden alınmış gerçek etkileşim verisi bulunmuyor. Demo modunda sahte analitik üretilmez. Hesaplar gerçek API ile bağlandığında bu ekran otomatik olarak dolacak.`,
      totals: empty,
      byPlatform: [],
      series: [],
      bestContent: []
    };
  }

  const totals = { ...empty };
  const platformMap = new Map<string, { impressions: number; engagement: number }>();
  const seriesMap = new Map<string, { impressions: number; engagement: number }>();

  for (const r of rows) {
    totals.impressions += r.impressions;
    totals.reach += r.reach;
    totals.likes += r.likes;
    totals.comments += r.comments;
    totals.shares += r.shares;
    totals.saves += r.saves;
    totals.clicks += r.clicks;
    totals.videoViews += r.videoViews;
    totals.followerDelta += r.followerDelta;

    const engagement = r.likes + r.comments * 2 + r.shares * 3 + r.saves * 2 + r.clicks;
    const p = platformMap.get(r.platform) ?? { impressions: 0, engagement: 0 };
    platformMap.set(r.platform, { impressions: p.impressions + r.impressions, engagement: p.engagement + engagement });

    const day = r.date.toISOString().slice(0, 10);
    const s = seriesMap.get(day) ?? { impressions: 0, engagement: 0 };
    seriesMap.set(day, { impressions: s.impressions + r.impressions, engagement: s.engagement + engagement });
  }

  const engagementTotal = totals.likes + totals.comments * 2 + totals.shares * 3 + totals.saves * 2 + totals.clicks;
  totals.engagementRate = totals.impressions ? (engagementTotal / totals.impressions) * 100 : 0;

  const best = [...rows]
    .map((r) => ({
      id: r.platformContent?.id ?? r.id,
      caption: (r.platformContent?.caption ?? '').slice(0, 120),
      platform: r.platform,
      impressions: r.impressions,
      engagementRate: r.engagementRate
    }))
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 5);

  return {
    hasData: true,
    note: `Son ${days} gün · ${rows.length} gerçek API ölçümü`,
    totals,
    byPlatform: Array.from(platformMap.entries())
      .map(([platform, v]) => ({
        platform: platform as PlatformCode,
        label: PLATFORM_META[platform as PlatformCode]?.name ?? platform,
        color: PLATFORM_META[platform as PlatformCode]?.brandColor ?? '#64748b',
        impressions: v.impressions,
        engagement: v.engagement,
        engagementRate: v.impressions ? (v.engagement / v.impressions) * 100 : 0
      }))
      .sort((a, b) => b.engagementRate - a.engagementRate),
    series: Array.from(seriesMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v })),
    bestContent: best
  };
}

/**
 * AI İçerik Önerileri — gerçek veriye dayalı karşılaştırmalar.
 * Veri yoksa öneri ÜRETMEZ, durumu açıkça belirtir.
 */
export async function generateInsights(workspaceId: string, days = 60): Promise<string[]> {
  const summary = await getMetricSummary(workspaceId, { days });
  if (!summary.hasData) {
    return [
      'Öneri üretmek için yeterli gerçek etkileşim verisi yok. Platform hesaplarını resmî API ile bağladıktan sonra analizler otomatik olarak oluşacak.'
    ];
  }
  const insights: string[] = [];

  const video = await prisma.platformContent.findMany({
    where: { content: { workspaceId }, contentType: { in: ['REEL', 'SHORTS', 'VIDEO'] }, status: 'PUBLISHED' },
    include: { analytics: { where: { source: 'API' }, select: { engagementRate: true } } }
  });
  const photo = await prisma.platformContent.findMany({
    where: { content: { workspaceId }, contentType: { in: ['FEED', 'POST', 'PIN'] }, status: 'PUBLISHED' },
    include: { analytics: { where: { source: 'API' }, select: { engagementRate: true } } }
  });
  const avg = (arr: typeof video) => {
    const rates = arr.flatMap((a) => a.analytics.map((x) => x.engagementRate));
    return rates.length ? rates.reduce((s, v) => s + v, 0) / rates.length : null;
  };
  const vAvg = avg(video);
  const pAvg = avg(photo);
  if (vAvg != null && pAvg != null && vAvg > pAvg * 1.15) {
    insights.push(
      `Video içerikleriniz fotoğraf içeriklerinden daha yüksek etkileşim alıyor (ortalama %${vAvg.toFixed(1)} / %${pAvg.toFixed(1)}). Haftalık planınızda Reels ve Shorts payını artırmayı değerlendirin.`
    );
  } else if (vAvg != null && pAvg != null) {
    insights.push(
      `Fotoğraf içerikleriniz video içeriklerle benzer veya daha iyi etkileşim alıyor (%${pAvg.toFixed(1)} / %${vAvg.toFixed(1)}). Görsel kalitesini koruyun.`
    );
  }

  if (summary.byPlatform.length > 1) {
    const top = summary.byPlatform[0];
    const bottom = summary.byPlatform[summary.byPlatform.length - 1];
    insights.push(
      `${top.label} en yüksek etkileşim oranına sahip (%${top.engagementRate.toFixed(1)}), ${bottom.label} ise en düşük (%${bottom.engagementRate.toFixed(
        1
      )}). ${bottom.label} için içerik türünü ve yayın saatini gözden geçirin.`
    );
  }

  if (summary.bestContent.length) {
    insights.push(
      `En iyi performans gösteren içeriğiniz: "${summary.bestContent[0].caption || 'başlıksız'}" — %${summary.bestContent[0].engagementRate.toFixed(
        1
      )} etkileşim oranı. Benzer yapıda içerik üretmeyi deneyin.`
    );
  }

  return insights.length ? insights : ['Yeterli çeşitlilikte veri biriktiğinde içerik türü ve saat bazlı öneriler burada görünecek.'];
}
