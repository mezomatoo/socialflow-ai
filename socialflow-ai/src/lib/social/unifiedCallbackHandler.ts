import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';
import { randomToken } from '@/lib/crypto';
import { getDecryptedProviderConfig } from './providerConfigService';
import { consumeOAuthState, exchangeAuthorizationCode, tokenSetToExpiry } from './oauth2';
import { discoverProviderAssets, storeDiscoverySession } from './assetDiscoveryService';

export async function handleUnifiedOAuthCallback(request: Request, providerKey: string): Promise<Response> {
  const normalized = providerKey.toUpperCase();
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/giris?yonlendir=/app/hesaplar', request.url), 303);
  }

  const destinationBase = new URL('/app/hesaplar', request.url);

  if (error || !code || !state) {
    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'oauth.callback.denied',
      metadata: {
        provider: normalized,
        error: error || 'MISSING_CODE_OR_STATE',
        errorDescription
      }
    });

    destinationBase.searchParams.set('baglanti', 'reddedildi');
    destinationBase.searchParams.set('hata', error || 'Yetkilendirme reddedildi.');
    return NextResponse.redirect(destinationBase, 303);
  }

  // Atomically claim state with replay protection
  const claimedState = await consumeOAuthState(state, {
    platform: normalized,
    userId: session.user.id,
    workspaceId: session.user.workspaceId
  });

  if (!claimedState) {
    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'oauth.callback.invalid_state',
      metadata: { provider: normalized }
    });

    destinationBase.searchParams.set('baglanti', 'gecersiz_state');
    return NextResponse.redirect(destinationBase, 303);
  }

  let metadata: { mode?: 'ORGANIC' | 'ADS' | 'ALL'; brandId?: string } = {};
  if (claimedState.metadata) {
    try {
      metadata = JSON.parse(claimedState.metadata);
    } catch { /* ignore */ }
  }

  try {
    const config = await getDecryptedProviderConfig(normalized);
    const isPkce = normalized === 'X' || normalized === 'TIKTOK' || normalized === 'PINTEREST';

    const tokenSet = await exchangeAuthorizationCode({
      config: {
        authorizationUrl: config.authorizationUrl,
        tokenUrl: config.tokenUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: config.requestedScopes,
        pkce: isPkce,
        clientAuth: normalized === 'X' || normalized === 'PINTEREST' ? 'basic' : 'body'
      },
      code,
      redirectUri: claimedState.redirectUri || config.redirectUri,
      codeVerifier: claimedState.codeVerifier || undefined
    });

    const expiry = tokenSetToExpiry(tokenSet);

    // Run asset discovery
    const discovered = await discoverProviderAssets({
      provider: normalized,
      accessToken: tokenSet.accessToken,
      refreshToken: tokenSet.refreshToken,
      expiresAt: expiry.expiresAt,
      scope: tokenSet.scope,
      mode: metadata.mode || 'ALL'
    });

    if (!discovered.length) {
      destinationBase.searchParams.set('baglanti', 'varlik_bulunamadi');
      destinationBase.searchParams.set('provider', normalized);
      return NextResponse.redirect(destinationBase, 303);
    }

    // Save discovery session
    const discoverySessionKey = randomToken(32);
    storeDiscoverySession(discoverySessionKey, {
      userId: session.user.id,
      workspaceId: session.user.workspaceId,
      provider: normalized,
      assets: discovered
    });

    destinationBase.searchParams.set('baglanti', 'kesfet');
    destinationBase.searchParams.set('session', discoverySessionKey);
    destinationBase.searchParams.set('provider', normalized);

    return NextResponse.redirect(destinationBase, 303);
  } catch (err: any) {
    console.error(`[handleUnifiedOAuthCallback] Error processing callback for ${normalized}:`, err);
    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'oauth.callback.error',
      metadata: {
        provider: normalized,
        error: err?.message
      }
    });

    destinationBase.searchParams.set('baglanti', 'hata');
    destinationBase.searchParams.set('mesaj', err?.message || 'Token değişimi başarısız oldu.');
    return NextResponse.redirect(destinationBase, 303);
  }
}
