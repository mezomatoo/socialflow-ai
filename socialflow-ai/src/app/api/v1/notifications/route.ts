import { apiRoute, ok } from '@/lib/api';
import { listNotifications } from '@/lib/services/notifications';

export const GET = apiRoute(async (request, { session }) => {
  const url = new URL(request.url);
  const items = await listNotifications(session.user.workspaceId, {
    userId: session.user.id,
    unreadOnly: url.searchParams.get('unread') === '1',
    limit: Math.min(200, Number(url.searchParams.get('limit') ?? 50))
  });
  return ok({ items });
});
