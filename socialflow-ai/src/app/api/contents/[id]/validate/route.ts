import { apiRoute, ok } from '@/lib/api';
import { runPreflight } from '@/lib/services/validationService';

/** "Yayın Kontrolü" */
export const GET = apiRoute(async (_request, { session, params }) => {
  const report = await runPreflight(params.id, session.user.workspaceId, { demoMode: session.user.demoMode });
  return ok(report);
});
