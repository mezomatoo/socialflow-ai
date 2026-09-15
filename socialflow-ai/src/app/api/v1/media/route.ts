import { apiRoute, ok } from '@/lib/api';
import { listMedia } from '@/lib/services/mediaService';
import { serializeMedia } from '@/lib/services/mediaSerializer';

export const GET = apiRoute(async (request, { session }) => {
  const url = new URL(request.url);
  const items = await listMedia(session.user.workspaceId, {
    kind: url.searchParams.get('kind') ?? undefined,
    brandId: url.searchParams.get('brandId') ?? undefined,
    campaign: url.searchParams.get('campaign') ?? undefined,
    tag: url.searchParams.get('tag') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    limit: Math.min(200, Number(url.searchParams.get('limit') ?? 60))
  });
  return ok({ items: items.map(serializeMedia) });
});
