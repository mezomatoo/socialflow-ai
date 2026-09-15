import { apiRoute, ok } from '@/lib/api';
import { restoreVersion } from '@/lib/services/contentService';

export const POST = apiRoute(
  async (request, { session, params }) => {
    const body = await request.json().catch(() => ({}));
    const result = await restoreVersion(params.id, Number(body.version), session.user.workspaceId);
    return ok(result);
  },
  { limit: 30 }
);
