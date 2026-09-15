import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok, fail } from '@/lib/api';
import { hasRole } from '@/lib/auth/session';
import { listExecutions } from '@/lib/automation/engine';

/** PHASE 4 — Kural yürütmeleri: başarılı/başarısız/atlanan tümü görünür (§124). */
export const GET = apiRoute(async (request, { session, params }) => {
  if (!isModuleEnabled('automation')) return fail('MODULE_NOT_ENABLED', 'Otomasyon motoru bu kurulumda kapalı.', 501);
  if (!hasRole(session.user.role, 'CREATOR')) return fail('FORBIDDEN', 'Bu işlem için yetkiniz bulunmuyor.', 403);
  const items = await listExecutions(session.user.workspaceId, params.id);
  return ok({ items });
});
