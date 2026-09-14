import { apiRoute, ok } from '@/lib/api';
import prisma from '@/lib/prisma';

/** Uygulamanın kendi gerçek yayın verisi (sahte metrik üretmez). */
export const GET = apiRoute(async (request, { session }) => {
  const url = new URL(request.url);
  const days = Math.min(180, Number(url.searchParams.get('days') ?? 30));
  const from = new Date(Date.now() - days * 24 * 3600_000);

  const rows = await prisma.platformContent.findMany({
    where: { content: { workspaceId: session.user.workspaceId }, publishedAt: { gte: from } },
    select: { publishedAt: true, platform: true, contentType: true, status: true }
  });

  const byDay = new Map<string, { date: string; published: number; failed: number }>();
  const byPlatform = new Map<string, number>();
  for (const r of rows) {
    const day = (r.publishedAt ?? new Date()).toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { date: day, published: 0, failed: 0 };
    if (r.status === 'FAILED') cur.failed++;
    else cur.published++;
    byDay.set(day, cur);
    byPlatform.set(r.platform, (byPlatform.get(r.platform) ?? 0) + 1);
  }

  return ok({
    series: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
    byPlatform: Array.from(byPlatform.entries()).map(([platform, count]) => ({ platform, count })),
    total: rows.length
  });
});
