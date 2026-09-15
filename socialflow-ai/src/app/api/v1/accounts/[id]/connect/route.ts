import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { assertRole } from '@/lib/auth/session';
import { beginInstagramConnection } from '@/lib/social/instagramConnection';
import { InstagramConnectionError } from '@/lib/social/instagramConnectionMessages';
import { apiRoute, ok, fail, notFound } from '@/lib/api';
import prisma from '@/lib/prisma';
import { getProvider } from '@/lib/social/registry';
import { resolveProviderCredentials } from '@/lib/social/workspaceCredentials';
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

    const creds = await resolveProviderCredentials(session.user.workspaceId, platform);

    if (session.user.demoMode || !creds) {
      await audit({
        workspaceId: session.user.workspaceId,
        userId: session.user.id,
        action: session.user.demoMode ? 'account.connect.demo' : 'account.connect.simulated',
        entityType: 'SocialAccount',
        entityId: params.id,
        request
      });
      // Kimlik bilgisi tanımlı olmayan platform bağlantısı simülasyon olarak
      // ACTIVE'a çekilir; böylece içerik akışları kesintisiz çalışmaya devam eder.
      if (account.connectionStatus !== 'ACTIVE') {
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: { connectionStatus: 'ACTIVE', lastValidatedAt: new Date() }
        });
      }
      return ok({
        demo: true,
        authorizeUrl: null,
        message: session.user.demoMode
          ? `Demo Modu — ${account.displayName} hesabı simülasyon olarak bağlı. Gerçek OAuth akışı için ${platform} API kimlik bilgilerini Ayarlar → Entegrasyonlar bölümünden tanımlayın.`
          : `${account.displayName} bağlandı. ${platform} için API kimlik bilgisi tanımlı olmadığından bağlantı simülasyon olarak tamamlandı; gerçek OAuth akışı için Ayarlar → Entegrasyonlar bölümünden kimlik bilgilerinizi tanımlayın.`,
        credentialsSet: Boolean(creds)
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
