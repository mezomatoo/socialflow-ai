import { apiRoute, ok, notFound } from '@/lib/api';
import { hasRole } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';
import { applyPlanItem } from '@/lib/planner/service';

/**
 * PHASE 4 — "Takvime Ekle" (§83/§138)
 * POST: plan öğesinden TASLAK içerik oluşturur. Yayınlama/zamanlama YAPILMAZ.
 */
export const POST = apiRoute(
  async (_request, { session, params }) => {
    if (!hasRole(session.user.role, 'CREATOR')) {
      return notFound('Plan öğesi bulunamadı.');
    }
    const result = await applyPlanItem({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      itemId: params.itemId
    });
    if (!result) return notFound('Plan öğesi bulunamadı.');

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'ai.planner.item_applied',
      entityType: 'ContentPlanItem',
      entityId: params.itemId,
      metadata: { contentId: result.contentId }
    });

    return ok(result);
  },
  { limit: 60 }
);
