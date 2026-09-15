import prisma from '../prisma';
import type { SessionContext } from '../auth/session';
import { hasRole } from '../auth/session';
import { env, providerCredentialsConfigured } from '../env';
import { toCipherText } from '../crypto';
import { consumeOAuthState, createOAuthState, tokenSetToExpiry } from './oauth2';
import { InstagramProvider, INSTAGRAM_PUBLISH_SCOPES } from './providers/InstagramProvider';
import { InstagramConnectionError as ConnectionError } from './instagramConnectionMessages';
import type { AccountProfile, TokenSet } from './types';

type ConnectionAdapter = {
  getAuthorizationUrl(params: { state: string; redirectUri: string; codeVerifier?: string; scopes?: string[] }): string;
  exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<TokenSet>;
  fetchAccountProfiles(token: string): Promise<AccountProfile[]>;
  fetchGrantedPermissions(token: string): Promise<string[]>;
};
function scopes(...raw: (string | null | undefined)[]) {
  return [...new Set(raw.flatMap(value => (value || '').split(/[\s,]+/)).filter(Boolean))];
}
export function instagramRedirectUri() {
  let base: URL;
  try { base = new URL(env.appUrl); } catch { throw new ConnectionError('configuration', 503); }
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new ConnectionError('configuration', 503);
  return new URL('/api/auth/instagram/callback', base).toString();
}
async function authorize(session: SessionContext) {
  const user = await prisma.user.findFirst({ where: { id: session.user.id, workspaceId: session.user.workspaceId, isActive: true }, include: { workspace: true } });
  if (session.sessionId === 'preview-demo' || !user || !hasRole(user.role, 'EDITOR')) throw new ConnectionError('forbidden', 403);
  if (env.demoMode || user.workspace.demoMode || !providerCredentialsConfigured('INSTAGRAM')) throw new ConnectionError('configuration', 503);
  instagramRedirectUri();
  return user;
}
export async function beginInstagramConnection(session: SessionContext, accountId: string, adapter: ConnectionAdapter = new InstagramProvider()) {
  const user = await authorize(session);
  const account = await prisma.socialAccount.findFirst({ where: { id: accountId, workspaceId: user.workspaceId, platform: 'INSTAGRAM' }, include: { token: true } });
  if (!account) throw new ConnectionError('not_found', 404);
  const redirectUri = instagramRedirectUri();
  const state = await createOAuthState({ platform: 'INSTAGRAM', userId: user.id, workspaceId: user.workspaceId,
    socialAccountId: account.id, accountUpdatedAt: account.updatedAt, redirectUri, redirect: '/sosyal-hesaplar' });
  const required = [...new Set([...INSTAGRAM_PUBLISH_SCOPES, ...(account.demoAccount ? [] : scopes(account.scopes, account.token?.scope))])];
  const authorizeUrl = adapter.getAuthorizationUrl({ state: state.state, codeVerifier: state.codeVerifier, redirectUri, scopes: required });
  await prisma.auditLog.create({ data: { workspaceId: user.workspaceId, userId: user.id, action: 'account.connect.start', entityType: 'SocialAccount', entityId: account.id, metadata: JSON.stringify({ platform: 'INSTAGRAM' }) } });
  return { demo: false, authorizeUrl };
}

/** One selected local account only. Failure never clears/replaces existing credentials. */
export async function completeInstagramConnection(session: SessionContext, input: { state: string; code?: string | null; denied?: boolean }, adapter: ConnectionAdapter = new InstagramProvider()) {
  const user = await authorize(session);
  const state = await consumeOAuthState(input.state, { platform: 'INSTAGRAM', userId: user.id, workspaceId: user.workspaceId });
  if (!state?.socialAccountId || !state.redirectUri || !state.accountUpdatedAt || state.redirectUri !== instagramRedirectUri()) throw new ConnectionError('invalid_state');
  if (input.denied) throw new ConnectionError('denied');
  if (!input.code || input.code.length > 8192) throw new ConnectionError('invalid_state');
  const account = await prisma.socialAccount.findFirst({ where: { id: state.socialAccountId, workspaceId: user.workspaceId, platform: 'INSTAGRAM' }, include: { token: true } });
  if (!account) throw new ConnectionError('not_found', 404);
  if (account.updatedAt.getTime() !== state.accountUpdatedAt.getTime()) throw new ConnectionError('stale_account', 409);
  let token: TokenSet, profiles: AccountProfile[], granted: string[];
  try {
    token = await adapter.exchangeCode({ code: input.code, redirectUri: state.redirectUri, codeVerifier: state.codeVerifier || undefined });
    if (!token.accessToken || !token.accessToken.trim() || (token.expiresIn != null && (!Number.isFinite(token.expiresIn) || token.expiresIn <= 60))) throw new Error('Invalid token');
    granted = await adapter.fetchGrantedPermissions(token.accessToken);
    profiles = await adapter.fetchAccountProfiles(token.accessToken);
  } catch { throw new ConnectionError('provider_error', 502); }
  const candidates = profiles.filter(profile => !account.demoAccount && account.externalId
    ? profile.externalId === account.externalId
    : profile.handle.replace(/^@/, '').toLowerCase() === account.handle.replace(/^@/, '').toLowerCase());
  if (candidates.length !== 1) throw new ConnectionError('account_mismatch');
  const profile = candidates[0];
  if (!profile.externalId || !profile.handle || !profile.displayName) throw new ConnectionError('provider_error', 502);
  const expires = tokenSetToExpiry(token);
  await prisma.$transaction(async tx => {
    // Permission revocation and account edits during the provider roundtrip must invalidate the callback.
    const currentUser = await tx.user.findFirst({ where: { id: user.id, workspaceId: user.workspaceId, isActive: true }, include: { workspace: { select: { demoMode: true } } } });
    if (!currentUser || !hasRole(currentUser.role, 'EDITOR')) throw new ConnectionError('forbidden', 403);
    if (currentUser.workspace.demoMode) throw new ConnectionError('configuration', 503);
    const current = await tx.socialAccount.findFirst({ where: { id: account.id, workspaceId: user.workspaceId }, include: { token: true } });
    if (!current || current.updatedAt.getTime() !== state.accountUpdatedAt!.getTime()) throw new ConnectionError('stale_account', 409);
    const required = [...INSTAGRAM_PUBLISH_SCOPES, ...(current.demoAccount ? [] : scopes(current.scopes, current.token?.scope))];
    if (required.some(scope => !granted.includes(scope))) throw new ConnectionError('permissions');
    const duplicate = await tx.socialAccount.findFirst({ where: { workspaceId: user.workspaceId, platform: 'INSTAGRAM', externalId: profile.externalId, demoAccount: false, id: { not: account.id } } });
    if (duplicate) throw new ConnectionError('account_mismatch');
    const scope = [...new Set(granted)].sort().join(',');
    const changed = await tx.socialAccount.updateMany({ where: { id: account.id, workspaceId: user.workspaceId, updatedAt: state.accountUpdatedAt! }, data: {
      externalId: profile.externalId, handle: profile.handle, displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || null, accountType: profile.accountType || 'BUSINESS', scopes: scope,
      demoAccount: false, connectionStatus: 'ACTIVE', lastValidatedAt: new Date(), lastError: null
    } });
    if (changed.count !== 1) throw new ConnectionError('stale_account', 409);
    const data = { accessTokenEnc: toCipherText(token.accessToken), refreshTokenEnc: token.refreshToken ? toCipherText(token.refreshToken) : null,
      tokenType: token.tokenType || 'Bearer', scope, expiresAt: expires.expiresAt, refreshExpiresAt: expires.refreshExpiresAt, lastRefreshedAt: new Date() };
    await tx.socialProviderToken.upsert({ where: { socialAccountId: account.id }, create: { socialAccountId: account.id, ...data }, update: data });
    await tx.auditLog.create({ data: { workspaceId: user.workspaceId, userId: user.id, action: 'account.connect.completed', entityType: 'SocialAccount', entityId: account.id, metadata: JSON.stringify({ platform: 'INSTAGRAM' }) } });
  });
  return { accountId: account.id };
}
