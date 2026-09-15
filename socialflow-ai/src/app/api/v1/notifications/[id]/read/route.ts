import { apiRoute, ok } from '@/lib/api';
import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { markRead } from '@/lib/services/notifications';

export const POST = apiRoute(async (_request, { session, params }) => {
    assertModuleEnabled('notifications');
  const count = await markRead(session.user.workspaceId, [params.id]);
  return ok({ marked: count });
}, { limit: 120 });
