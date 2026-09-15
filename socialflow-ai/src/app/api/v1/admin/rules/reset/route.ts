import { apiRoute, ok } from '@/lib/api';
import { ensureRules, invalidateRuleCache } from '@/lib/rules/ruleEngine';
import { assertRole } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';

/** Kuralları yerleşik değerlere sıfırla. */
export const POST = apiRoute(
  async (_request, { session }) => {
    assertRole(session, 'ADMIN');
    await ensureRules(session.user.workspaceId, true);
    invalidateRuleCache(session.user.workspaceId);
    await audit({ workspaceId: session.user.workspaceId, userId: session.user.id, action: 'rules.reset' });
    return ok({ reset: true });
  },
  { limit: 5 }
);
