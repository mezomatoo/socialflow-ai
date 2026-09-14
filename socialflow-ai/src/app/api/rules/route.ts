import { apiRoute, ok } from '@/lib/api';
import { getAllRules, ensureRules } from '@/lib/rules/ruleEngine';

/** Platform kural motoru — bileşenler limitleri buradan okur. */
export const GET = apiRoute(async (_request, { session }) => {
  await ensureRules(session.user.workspaceId).catch(() => undefined);
  const rules = await getAllRules(session.user.workspaceId);
  return ok({ items: rules });
});
