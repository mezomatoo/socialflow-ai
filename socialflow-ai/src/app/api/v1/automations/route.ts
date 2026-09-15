import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok, fail, badRequest } from '@/lib/api';
import { hasRole } from '@/lib/auth/session';
import { createRule, listRules, type AutomationAction, type AutomationCondition, type AutomationTrigger } from '@/lib/automation/engine';

/**
 * PHASE 4 — Otomasyon kuralları (§98-§100, §124)
 * GET: kurallar (çalışma alanına özgü). POST: yeni kural.
 * Yetki: okuma CREATOR+, yazma EDITOR+. Modül kapalıysa dürüst 501.
 */

export const GET = apiRoute(async (_request, { session }) => {
  if (!isModuleEnabled('automation')) return fail('MODULE_NOT_ENABLED', 'Otomasyon motoru bu kurulumda kapalı.', 501);
  if (!hasRole(session.user.role, 'CREATOR')) return fail('FORBIDDEN', 'Bu işlem için yetkiniz bulunmuyor.', 403);
  const rules = await listRules(session.user.workspaceId);
  return ok({ items: rules });
});

export const POST = apiRoute(
  async (request, { session }) => {
    if (!isModuleEnabled('automation')) return fail('MODULE_NOT_ENABLED', 'Otomasyon motoru bu kurulumda kapalı.', 501);
    if (!hasRole(session.user.role, 'EDITOR')) return fail('FORBIDDEN', 'Kural oluşturmak için yetkiniz bulunmuyor.', 403);
    const body = await request.json().catch(() => ({}));
    const result = await createRule(
      { workspaceId: session.user.workspaceId, userId: session.user.id },
      {
        name: String(body.name ?? ''),
        description: typeof body.description === 'string' ? body.description : null,
        trigger: String(body.trigger ?? '') as AutomationTrigger,
        conditions: (Array.isArray(body.conditions) ? body.conditions : []).slice(0, 10) as AutomationCondition[],
        actions: (Array.isArray(body.actions) ? body.actions : []).slice(0, 5) as AutomationAction[],
        enabled: Boolean(body.enabled),
        autonomyLevel: Number(body.autonomyLevel ?? 1) as 1 | 2 | 3 | 4
      }
    );
    if (result.error) return badRequest(result.error);
    return ok({ rule: result.rule });
  },
  { limit: 30 }
);
