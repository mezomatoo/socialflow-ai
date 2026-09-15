import { apiRoute, ok } from '@/lib/api';
import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { markAllRead } from '@/lib/services/notifications';

export const POST = apiRoute(async (_request, { session }) => {
    assertModuleEnabled('notifications');
  const count = await markAllRead(session.user.workspaceId, session.user.id);
  return ok({ marked: count });
}, { limit: 30 });
