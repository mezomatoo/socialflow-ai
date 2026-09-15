import { apiRoute, ok } from '@/lib/api';
import { markRead } from '@/lib/services/notifications';

export const POST = apiRoute(async (_request, { session, params }) => {
  const count = await markRead(session.user.workspaceId, [params.id]);
  return ok({ marked: count });
}, { limit: 120 });
