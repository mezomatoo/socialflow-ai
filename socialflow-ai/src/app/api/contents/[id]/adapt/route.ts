import { apiRoute, ok } from '@/lib/api';
import { adaptContentToPlatforms } from '@/lib/services/contentService';
import { getContentDetail } from '@/lib/services/contentService';

/** "AI ile Platformlara Uyarla" */
export const POST = apiRoute(
  async (request, { session, params }) => {
    const body = await request.json().catch(() => ({}));
    const result = await adaptContentToPlatforms({
      contentId: params.id,
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      targetIds: Array.isArray(body.targetIds) ? body.targetIds.map(String) : undefined,
      preserveManual: Boolean(body.preserveManual)
    });
    const detail = await getContentDetail(params.id, session.user.workspaceId);
    return ok({ ...result, content: detail });
  },
  { limit: 40, windowMs: 60_000 }
);
