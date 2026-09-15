import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok, fail, notFound, badRequest } from '@/lib/api';
import { hasRole } from '@/lib/auth/session';
import { updateRule, deleteRule, type AutomationAction, type AutomationCondition } from '@/lib/automation/engine';

/** PHASE 4 — Otomasyon kuralı güncelleme/silme (§124). Yazma yetkisi: EDITOR+. */
export const PATCH = apiRoute(
  async (request, { session, params }) => {
    if (!isModuleEnabled('automation')) return fail('MODULE_NOT_ENABLED', 'Otomasyon motoru bu kurulumda kapalı.', 501);
    if (!hasRole(session.user.role, 'EDITOR')) return fail('FORBIDDEN', 'Bu işlem için yetkiniz bulunmuyor.', 403);
    const body = await request.json().catch(() => ({}));
    try {
      const rule = await updateRule({ workspaceId: session.user.workspaceId, userId: session.user.id }, params.id, {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.description !== undefined ? { description: body.description === null ? null : String(body.description) } : {}),
        ...(body.enabled !== undefined ? { enabled: Boolean(body.enabled) } : {}),
        ...(body.autonomyLevel !== undefined ? { autonomyLevel: Number(body.autonomyLevel) as 1 | 2 | 3 | 4 } : {}),
        ...(body.conditions !== undefined ? { conditions: (Array.isArray(body.conditions) ? body.conditions : []).slice(0, 10) as AutomationCondition[] } : {}),
        ...(body.actions !== undefined ? { actions: (Array.isArray(body.actions) ? body.actions : []).slice(0, 5) as AutomationAction[] } : {})
      });
      if (!rule) return notFound('Kural bulunamadı.');
      return ok({ rule });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'Kural güncellenemedi.');
    }
  },
  { limit: 60 }
);

export const DELETE = apiRoute(
  async (_request, { session, params }) => {
    if (!isModuleEnabled('automation')) return fail('MODULE_NOT_ENABLED', 'Otomasyon motoru bu kurulumda kapalı.', 501);
    if (!hasRole(session.user.role, 'EDITOR')) return fail('FORBIDDEN', 'Bu işlem için yetkiniz bulunmuyor.', 403);
    const deleted = await deleteRule({ workspaceId: session.user.workspaceId, userId: session.user.id }, params.id);
    if (!deleted) return notFound('Kural bulunamadı.');
    return ok({ deleted: true });
  },
  { limit: 60 }
);
