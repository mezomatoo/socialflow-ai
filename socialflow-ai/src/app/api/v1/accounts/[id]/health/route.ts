import { assertRole } from '@/lib/auth/session';
import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok, fail, notFound } from '@/lib/api';
import prisma from '@/lib/prisma';
import { checkAccountHealth } from '@/lib/social/accountHealth';
import { audit } from '@/lib/security/audit';

/**
 * "Bağlantıyı Test Et" — hesap sağlığı denetimi (Faz 2, §27).
 * Token geçerliliği, profil erişimi ve yetenekler kontrol edilir;
 * sorun varsa hesap NEEDS_REAUTH'e çekilip Türkçe bildirim oluşturulur.
 */
export const POST = apiRoute(
  async (_request, { session, params }) => {
    assertModuleEnabled('socialAccounts');
    assertRole(session, 'EDITOR');

    const account = await prisma.socialAccount.findFirst({
      where: { id: params.id, workspaceId: session.user.workspaceId },
      select: { id: true }
    });
    if (!account) return notFound('Hesap bulunamadı.');

    try {
      const result = await checkAccountHealth(params.id, {
        workspaceId: session.user.workspaceId,
        userId: session.user.id,
        notifyOnFailure: true
      });
      await audit({
        workspaceId: session.user.workspaceId,
        userId: session.user.id,
        action: 'account.health.check',
        entityType: 'SocialAccount',
        entityId: params.id,
        metadata: { ok: result.ok, status: result.connectionStatus }
      });
      return ok(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sağlık denetimi tamamlanamadı.';
      return fail('HEALTH_CHECK_FAILED', message, 502);
    }
  },
  { limit: 20 }
);
