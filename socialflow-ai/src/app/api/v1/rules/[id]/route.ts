import { apiRoute, ok, badRequest } from '@/lib/api';
import prisma from '@/lib/prisma';
import { updateRule, invalidateRuleCache, ensureRules } from '@/lib/rules/ruleEngine';
import { audit } from '@/lib/security/audit';
import { assertRole } from '@/lib/auth/session';

/** Kural güncelleme — yalnızca Yönetici/Sahip. */
export const PATCH = apiRoute(
  async (request, { session, params }) => {
    assertRole(session, 'ADMIN');
    const existing = await prisma.platformRule.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!existing) return badRequest('Kural bulunamadı.');

    const body = await request.json().catch(() => ({}));
    const rule = await updateRule(session.user.workspaceId, existing.platform, existing.contentType, body);
    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'rule.update',
      entityType: 'PlatformRule',
      entityId: params.id,
      metadata: { changed: Object.keys(body) },
      request
    });
    return ok(rule);
  },
  { limit: 40 }
);
