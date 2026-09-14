import { apiRoute, ok } from '@/lib/api';
import { markAllRead } from '@/lib/services/notifications';

export const POST = apiRoute(async (_request, { session }) => {
  const count = await markAllRead(session.user.workspaceId, session.user.id);
  return ok({ marked: count });
}, { limit: 30 });
