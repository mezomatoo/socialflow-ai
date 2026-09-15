import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { assertRole } from '@/lib/auth/session';
import { beginInstagramConnection } from '@/lib/social/instagramConnection';
import { InstagramConnectionError } from '@/lib/social/instagramConnectionMessages';
import { apiRoute, ok, fail, notFound } from '@/lib/api';
import prisma from '@/lib/prisma';
import { getProvider, isDemoProvider } from '@/lib/social/registry';
import { createOAuthState } from '@/lib/social/oauth2';
import { env } from '@/lib/env';
import { audit } from '@/lib/security/audit';
import type { PlatformCode } from '@/lib/platforms/platforms';

/**
 * OAuth akışını başlatır. Kullanıcıdan ASLA sosyal medya parolası istenmez.
 * Demo modunda veya API kimlik bilgileri yoksa kullanıcıya açıkça bildirilir.
 */
export const POST = apiRoute(
  async (request, { session, params }) => {
    assertModuleEnabled('socialAccounts');
    assertRole(session, 'EDITOR');
    const account = await prisma.socialAccount.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!account) return notFound('Hesap bulunamadı.');

    const platform = account.platform as PlatformCode;

    if (session.user.demoMode || isDemoProvider(platform)) {
      await audit({ workspaceId: session.user.workspaceId, userId: session.user.id, action: 'account.connect.demo', entityType: 'SocialAccount', entityId: params.id, request });
      return ok({
        demo: true,
        authorizeUrl: null,
        message: `Simülasyon — ${account.displayName} hesabı gerçek bağlantı olmadan bağlandı. Gerçek OAuth akışı için ${platform} API kimlik bilgilerini Ayarlar → Entegrasyonlar bölümünden tanımlayın.`,
        credentialsSet: Boolean(env.providers[platform]?.id && env.providers[platform]?.secret)
      });
    }

    if (platform === 'INSTAGRAM') {
      try { return ok(await beginInstagramConnection(session, account.id)); }
      catch (error) {
        return error instanceof InstagramConnectionError
          ? fail(error.code, error.message, error.status)
          : fail('CONNECTION_FAILED', 'Bağlantı başlatılamadı. Lütfen tekrar deneyin.', 502);
      }
    }

    const provider = getProvider(platform, { forceReal: true });
    const redirectUri = `${env.appUrl.replace(/\/$/, '')}/api/auth/${platform.toLowerCase()}/callback`;
    const { state, codeVerifier } = await createOAuthState({
      platform,
      userId: session.user.id,
      workspaceId: session.user.workspaceId,
      redirect: `/sosyal-hesaplar`
    });

    const authorizeUrl = provider.getAuthorizationUrl({ state, redirectUri, codeVerifier });
    await audit({ workspaceId: session.user.workspaceId, userId: session.user.id, action: 'account.connect.start', entityType: 'SocialAccount', entityId: params.id, metadata: { platform }, request });

    return ok({ demo: false, authorizeUrl, state });
  },
  { limit: 20, sessionCsrf: true }
);
