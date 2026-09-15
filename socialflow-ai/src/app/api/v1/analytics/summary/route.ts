import { apiRoute, ok } from '@/lib/api';
import { getMetricSummary, generateInsights } from '@/lib/services/analyticsService';

/** Analizler — yalnızca gerçek API verisi; sahte metrik üretilmez. */
export const GET = apiRoute(async (request, { session }) => {
  const url = new URL(request.url);
  const days = Number(url.searchParams.get('days') ?? 30);
  const summary = await getMetricSummary(session.user.workspaceId, {
    days,
    platform: url.searchParams.get('platform') ?? undefined,
    brandId: url.searchParams.get('brandId') ?? undefined,
    campaignId: url.searchParams.get('campaignId') ?? undefined
  });
  const insights = await generateInsights(session.user.workspaceId, days);
  return ok({ ...summary, insights, demoMode: session.user.demoMode });
});
