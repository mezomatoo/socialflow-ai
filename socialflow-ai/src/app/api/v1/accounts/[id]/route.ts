import { apiRoute, ok, badRequest, notFound } from '@/lib/api';
import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import prisma from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

export const PATCH = apiRoute(
  async (request, { session, params }) => {
    assertModuleEnabled('socialAccounts');
    const account = await prisma.socialAccount.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!account) return notFound('Hesap bulunamadı.');
    const body = await request.json().catch(() => ({}));
    const data: any = {};
    if (body.displayName !== undefined) data.displayName = String(body.displayName);
    if (body.brandId !== undefined) data.brandId = body.brandId ? String(body.brandId) : null;
    if (body.accountType !== undefined) data.accountType = String(body.accountType);
    await prisma.socialAccount.update({ where: { id: params.id }, data });
    await audit({ workspaceId: session.user.workspaceId, userId: session.user.id, action: 'account.update', entityType: 'SocialAccount', entityId: params.id, request });
    return ok({ updated: true });
  },
  { limit: 60 }
);

/** Bağlantıyı kes — token güvenli biçimde silinir. */
export const DELETE = apiRoute(
  async (_request, { session, params }) => {
    const account = await prisma.socialAccount.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!account) return notFound('Hesap bulunamadı.');
    if (account.demoAccount) {
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
