import { apiRoute } from '@/lib/api';
import { destroySession } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';

export const POST = apiRoute(
  async (_request, { session }) => {
    await audit({ workspaceId: session.user.workspaceId, userId: session.user.id, action: 'auth.logout' });
    return destroySession();
  },
  { limit: 20 }
);
