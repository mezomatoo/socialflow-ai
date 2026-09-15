import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok } from '@/lib/api';
import { recommendPublishingTimes } from '@/lib/ai/publishingTimeService';

/** "En İyi Saati AI ile Öner" */
export const POST = apiRoute(
  async (request, { session }) => {
  assertModuleEnabled('scheduling');
    const body = await request.json().catch(() => ({}));
    const out = await recommendPublishingTimes(session.user.workspaceId, {
      platform: body.platform ? String(body.platform) : undefined,
      brandId: body.brandId ? String(body.brandId) : undefined,
      timezone: body.timezone ?? 'Europe/Istanbul',
      count: Number(body.count ?? 5)
    });
    return ok(out);
  },
  { limit: 30 }
);
