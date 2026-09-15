import { apiRoute, ok } from '@/lib/api';
import { listPlans } from '@/lib/planner/service';

/** PHASE 4 — AI Planlayıcı: kayıtlı planlar (çalışma alanına özgü). */
export const GET = apiRoute(async (_request, { session }) => {
  const plans = await listPlans(session.user.workspaceId);
  return ok({ items: plans });
});
