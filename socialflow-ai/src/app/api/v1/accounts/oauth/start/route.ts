import { apiRoute, ok, fail } from '@/lib/api';
import { assertRole } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';
import { env } from '@/lib/env';
import { getDecryptedProviderConfig } from '@/lib/social/providerConfigService';
import { createOAuthState, buildAuthorizationUrl } from '@/lib/social/oauth2';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(
  async (request, { session }) => {
    assertRole(session, 'EDITOR');
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || !body.provider) {
      return fail('INVALID_INPUT', 'Sağlayıcı kodu (provider) zorunludur.', 400);
    }

    const providerKey = String(body.provider).toUpperCase();
    const mode = (body.mode === 'ORGANIC' || body.mode === 'ADS' ? body.mode : 'ALL') as 'ORGANIC' | 'ADS' | 'ALL';
    const brandId = body.brandId ? String(body.brandId) : null;

    const config = await getDecryptedProviderConfig(providerKey);

    if (!config.isConfigured) {
      return fail(
        'PROVIDER_NOT_CONFIGURED',
        `${config.provider} API entegrasyonu henüz yapılandırılmamış. Lütfen sistem yöneticinizle iletişime geçin.`,
        422
      );
    }

    // Determine scopes according to mode
    let scopesToRequest = [...config.requestedScopes];
    if (mode === 'ORGANIC') {
      scopesToRequest = scopesToRequest.filter(s => !s.toLowerCase().includes('ads') && !s.toLowerCase().includes('adwords'));
    } else if (mode === 'ADS') {
      scopesToRequest = scopesToRequest.filter(s => s.toLowerCase().includes('ads') || s.toLowerCase().includes('adwords') || s.toLowerCase().includes('basic') || s.toLowerCase().includes('profile'));
    }

    const { state, codeVerifier } = await createOAuthState({
      platform: providerKey,
      userId: session.user.id,
      workspaceId: session.user.workspaceId,
      redirectUri: config.redirectUri,
      redirect: '/app/hesaplar',
      metadata: {
        provider: providerKey,
        mode,
        brandId
      }
    });

    const isPkce = providerKey === 'X' || providerKey === 'TIKTOK' || providerKey === 'PINTEREST';

    const authorizeUrl = buildAuthorizationUrl(
      {
        authorizationUrl: config.authorizationUrl,
        tokenUrl: config.tokenUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: scopesToRequest,
        scopeSeparator: providerKey === 'META' || providerKey === 'THREADS' ? ',' : ' ',
        pkce: isPkce,
        extraAuthParams: providerKey === 'GOOGLE'
          ? { access_type: 'offline', prompt: 'consent' }
          : providerKey === 'META'
            ? { auth_type: 'rerequest' }
            : {}
      },
      {
        state,
        redirectUri: config.redirectUri,
        codeVerifier: isPkce ? codeVerifier : undefined
      }
    );

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'oauth.start',
      metadata: {
        provider: providerKey,
        mode,
        brandId
      },
      request
    });

    return ok({
      provider: providerKey,
      authorizeUrl,
      state
    });
  },
  { limit: 20, sessionCsrf: true }
);
