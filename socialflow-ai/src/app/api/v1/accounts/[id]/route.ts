import { assertRole } from '@/lib/auth/session';
import { apiRoute, ok, badRequest, notFound } from '@/lib/api';
import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import prisma from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

export const PATCH = apiRoute(
  async (request, { session, params }) => {
  assertModuleEnabled('socialAccounts');
    assertRole(session, 'EDITOR');
    const account = await prisma.socialAccount.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!account) return notFound('Hesap bulunamadı.');
    const body = await request.json().catch(() => ({}));
    const data: any = {};
    if (body.displayName !== undefined) data.displayName = String(body.displayName);
    if (body.brandId !== undefined) {
      data.brandId = body.brandId ? String(body.brandId) : null;
      if (data.brandId && !await prisma.brand.findFirst({ where: { id: data.brandId, workspaceId: session.user.workspaceId } })) return notFound('Marka bulunamadı.');
    }
    if (body.accountType !== undefined) data.accountType = String(body.accountType);
    if (body.publishMode !== undefined) {
      const mode = String(body.publishMode);
      if (!['AUTO', 'MANUAL'].includes(mode)) return badRequest('Geçersiz yayın modu.');
      data.publishMode = mode;
    }
    await prisma.socialAccount.update({ where: { id: params.id }, data });
    await audit({ workspaceId: session.user.workspaceId, userId: session.user.id, action: 'account.update', entityType: 'SocialAccount', entityId: params.id, request });
    return ok({ updated: true });
  },
  { limit: 60 }
);

/** Bağlantıyı kes — token güvenli biçimde silinir. */
export const DELETE = apiRoute(
  async (_request, { session, params }) => {
    assertRole(session, 'EDITOR');
    const account = await prisma.socialAccount.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!account) return notFound('Hesap bulunamadı.');
    const hasInboxHistory = await prisma.inboxEvent.count({ where: { workspaceId: session.user.workspaceId, socialAccountId: account.id } })
      || await prisma.socialParticipant.count({ where: { workspaceId: session.user.workspaceId, socialAccountId: account.id } });
    if (account.demoAccount && !hasInboxHistory) {
      await prisma.socialAccount.delete({ where: { id: params.id } });
    } else {
      await prisma.socialProviderToken.deleteMany({ where: { socialAccountId: params.id } });
      await prisma.socialAccount.update({
        where: { id: params.id },
        data: { connectionStatus: 'REVOKED', externalId: null, lastError: null }
      });
    }
    await audit({ workspaceId: session.user.workspaceId, userId: session.user.id, action: 'account.disconnect', entityType: 'SocialAccount', entityId: params.id });
    return ok({ disconnected: true });
  },
  { limit: 20 }
);
