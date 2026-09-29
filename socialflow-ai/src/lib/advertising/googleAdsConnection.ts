import prisma from '../prisma';
import type { SessionContext } from '../auth/session';
import { hasRole } from '../auth/session';
import { env } from '../env';
import { toCipherText } from '../crypto';
import { isFeatureEnabled } from '../brandkit/featureFlags';
import { consumeOAuthState, createOAuthState, tokenSetToExpiry } from '../social/oauth2';
import type { TokenSet } from '../social/types';
import { AdvertisingError } from './contracts';
import { GoogleAdsProvider } from './GoogleAdsProvider';

const GOOGLE_ADS_PLATFORM = 'GOOGLE_ADS';
const REDIRECT_PATH = '/api/auth/google-ads/callback';

function configurationError() {
  return new AdvertisingError('CONFIGURATION', 'Google Ads OAuth ve developer token ayarları tamamlanmamış.', 503);
}

/** OAuth redirect URI is derived server-side and never accepted from the browser. */
export function googleAdsRedirectUri() {
  let base: URL;
  try { base = new URL(env.appUrl); } catch { throw configurationError(); }
  const localHttp = base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname);
  if ((!['https:', 'http:'].includes(base.protocol) || (!localHttp && base.protocol !== 'https:')) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw configurationError();
  }
  return new URL(REDIRECT_PATH, base).toString();
}

async function authorize(session: SessionContext) {
  if (session.sessionId === 'preview-demo') throw new AdvertisingError('PREVIEW_ONLY', 'Demo önizleme oturumu gerçek Google Ads hesabına bağlanamaz.', 403);
  const user = await prisma.user.findFirst({ where: { id: session.user.id, workspaceId: session.user.workspaceId, isActive: true }, include: { workspace: true } });
  if (!user || !hasRole(user.role, 'ADMIN')) {
    throw new AdvertisingError('FORBIDDEN', 'Google Ads hesabını bağlamak için sahip veya yönetici yetkisi gerekir.', 403);
  }
  if (!isFeatureEnabled('paidMedia') || !isFeatureEnabled('googleAds')) {
    throw new AdvertisingError('FEATURE_DISABLED', 'Google Ads bağlantısı bu kurulumda kapalı.', 404);
  }
  if (env.demoMode || user.workspace.demoMode) {
    throw new AdvertisingError('PREVIEW_ONLY', 'Demo Modu gerçek Google Ads hesabına bağlanamaz.', 403);
  }
  if (!env.providers.GOOGLE_ADS?.id || !env.providers.GOOGLE_ADS.secret || !env.advertising.googleAds.developerToken) throw configurationError();
  googleAdsRedirectUri();
  return user;
}

export async function beginGoogleAdsConnection(session: SessionContext) {
  const user = await authorize(session);
  const redirectUri = googleAdsRedirectUri();
  const state = await createOAuthState({
    platform: GOOGLE_ADS_PLATFORM,
    userId: user.id,
    workspaceId: user.workspaceId,
    redirectUri,
    redirect: '/app/reklamlar/hesaplar'
  });
  const provider = new GoogleAdsProvider();
  const authorizeUrl = provider.getAuthorizationUrl({ state: state.state, codeVerifier: state.codeVerifier, redirectUri });
  await prisma.auditLog.create({ data: {
    workspaceId: user.workspaceId,
    userId: user.id,
    action: 'ads.account.connect.start',
    entityType: 'AdAccount',
    metadata: JSON.stringify({ provider: 'GOOGLE' })
  } });
  return { demo: false, authorizeUrl };
}

/**
 * Exchanges the code, verifies accessible customers through Google Ads, and
 * only then writes AdAccount records. Existing paid credentials are never
 * removed when the provider roundtrip fails.
 */
export async function completeGoogleAdsConnection(session: SessionContext, input: { state: string; code?: string | null; denied?: boolean }) {
  const user = await authorize(session);
  const state = await consumeOAuthState(input.state, { platform: GOOGLE_ADS_PLATFORM, userId: user.id, workspaceId: user.workspaceId });
  if (!state?.redirectUri || state.redirectUri !== googleAdsRedirectUri()) throw new AdvertisingError('INVALID_STATE', 'Google Ads bağlantı isteği geçersiz veya süresi dolmuş.', 400);
  if (input.denied) throw new AdvertisingError('DENIED', 'Google Ads erişim izni verilmedi.', 400);
  if (!input.code || input.code.length > 8192) throw new AdvertisingError('INVALID_STATE', 'Google Ads bağlantı isteği geçersiz veya süresi dolmuş.', 400);

  const provider = new GoogleAdsProvider();
  let token: TokenSet;
  try {
    token = await provider.exchangeCode({ code: input.code, redirectUri: state.redirectUri, codeVerifier: state.codeVerifier || undefined });
    if (!token.accessToken || !token.accessToken.trim() || (token.expiresIn != null && (!Number.isFinite(token.expiresIn) || token.expiresIn <= 60))) throw new Error('invalid token');
  } catch (error) {
    if (error instanceof AdvertisingError) throw error;
    throw new AdvertisingError('PROVIDER_ERROR', 'Google Ads yetkilendirme kodu doğrulanamadı.', 502);
  }

  let accounts;
  try {
    accounts = (await provider.readAdAccounts({ workspaceId: user.workspaceId, accessToken: token.accessToken })).items;
  } catch (error) {
    if (error instanceof AdvertisingError) throw error;
    throw new AdvertisingError('PROVIDER_ERROR', 'Google Ads hesapları doğrulanamadı.', 502);
  }
  const uniqueAccounts = [...new Map(accounts.map(account => [account.providerAccountId, account])).values()];
  if (!uniqueAccounts.length) throw new AdvertisingError('NO_ACCOUNTS', 'Bu Google hesabıyla erişilebilen bir Google Ads müşteri hesabı bulunamadı.', 422);

  const expires = tokenSetToExpiry(token);
  const scope = [...new Set((token.scope || 'https://www.googleapis.com/auth/adwords').split(/[\s,]+/).filter(Boolean))].sort().join(',');
  const now = new Date();
  await prisma.$transaction(async tx => {
    const currentUser = await tx.user.findFirst({ where: { id: user.id, workspaceId: user.workspaceId, isActive: true }, include: { workspace: { select: { demoMode: true } } } });
    if (!currentUser || !hasRole(currentUser.role, 'ADMIN')) throw new AdvertisingError('FORBIDDEN', 'Google Ads hesabını bağlama yetkiniz artık yok.', 403);
    if (currentUser.workspace.demoMode) throw new AdvertisingError('PREVIEW_ONLY', 'Demo Modu gerçek Google Ads hesabına bağlanamaz.', 403);

    for (const inputAccount of uniqueAccounts) {
      const existing = await tx.adAccount.findFirst({ where: { workspaceId: user.workspaceId, provider: 'GOOGLE', providerAccountId: inputAccount.providerAccountId } });
      const account = existing
        ? await tx.adAccount.update({ where: { id: existing.id }, data: {
          displayName: inputAccount.name,
          currency: inputAccount.currency,
          timezone: inputAccount.timezone,
          providerTimezone: inputAccount.providerTimezone,
          connectionStatus: 'CONNECTED',
          grantedScopes: JSON.stringify(scope.split(',')),
          lastValidatedAt: now,
          lastAccountSyncAt: now,
          lastCampaignSyncAt: null,
          version: { increment: 1 }
        } })
        : await tx.adAccount.create({ data: {
          workspaceId: user.workspaceId,
          provider: 'GOOGLE',
          providerAccountId: inputAccount.providerAccountId,
          displayName: inputAccount.name,
          currency: inputAccount.currency,
          timezone: inputAccount.timezone,
          providerTimezone: inputAccount.providerTimezone,
          connectionStatus: 'CONNECTED',
          grantedScopes: JSON.stringify(scope.split(',')),
          lastValidatedAt: now,
          lastAccountSyncAt: now
        } });

      const previous = await tx.adAccountCredential.findUnique({ where: { adAccountId: account.id }, select: { refreshTokenEnc: true } });
      await tx.adAccountCredential.upsert({
        where: { adAccountId: account.id },
        create: {
          workspaceId: user.workspaceId,
          adAccountId: account.id,
          accessTokenEnc: toCipherText(token.accessToken),
          refreshTokenEnc: token.refreshToken ? toCipherText(token.refreshToken) : null,
          expiresAt: expires.expiresAt,
          lastRotatedAt: now
        },
        update: {
          accessTokenEnc: toCipherText(token.accessToken),
          refreshTokenEnc: token.refreshToken ? toCipherText(token.refreshToken) : previous?.refreshTokenEnc ?? null,
          expiresAt: expires.expiresAt,
          lastRotatedAt: now
        }
      });

      const latest = await tx.adProviderCapability.findFirst({ where: { workspaceId: user.workspaceId, adAccountId: account.id }, orderBy: { version: 'desc' }, select: { version: true } });
      await tx.adProviderCapability.create({ data: {
        workspaceId: user.workspaceId,
        adAccountId: account.id,
        version: (latest?.version ?? 0) + 1,
        apiVersion: provider.info.apiVersion,
        capabilities: JSON.stringify(provider.getCapabilities()),
        source: 'PROVIDER',
        verifiedAt: now
      } });
    }

    await tx.auditLog.create({ data: {
      workspaceId: user.workspaceId,
      userId: user.id,
      action: 'ads.account.connect.completed',
      entityType: 'AdAccount',
      metadata: JSON.stringify({ provider: 'GOOGLE', count: uniqueAccounts.length })
    } });
  });

  return { provider: 'GOOGLE', accountCount: uniqueAccounts.length };
}
