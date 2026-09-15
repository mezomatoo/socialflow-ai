import crypto from 'crypto';
import prisma from '../prisma';
import type { TokenSet } from './types';

/**
 * OAuth 2.0 yardımcıları — state + PKCE doğrulaması.
 * Kullanıcıdan asla sosyal medya parolası istenmez; yalnızca resmî
 * yönlendirme akışı kullanılır.
 */

export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  /** Bazı sağlayıcılar scope'u boşlukla, bazıları virgülle ayırır. */
  scopeSeparator?: ' ' | ',';
  /** PKCE kullanılsın mı (X, TikTok, Threads vb.). */
  pkce?: boolean;
  /** Ek sorgu parametreleri. */
  extraAuthParams?: Record<string, string>;
  /** İstemci kimlik doğrulama yöntemi. */
  clientAuth?: 'body' | 'basic';
}

export function generateState(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function codeChallengeFromVerifier(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/** Tek kullanımlık, kısa ömürlü OAuth state kaydı oluşturur. */
export async function createOAuthState(params: {
  platform: string;
  userId?: string | null;
  workspaceId?: string | null;
  redirect?: string;
  ttlSeconds?: number;
}) {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const expiresAt = new Date(Date.now() + (params.ttlSeconds ?? 600) * 1000);

  await prisma.oAuthState.create({
    data: {
      state,
      platform: params.platform,
      userId: params.userId ?? null,
      workspaceId: params.workspaceId ?? null,
      codeVerifier,
      redirect: params.redirect ?? null,
      expiresAt
    }
  });

  return { state, codeVerifier, expiresAt };
}

export interface OAuthStateBinding {
  platform: string;
  userId: string;
  workspaceId: string;
}

/** Check caller binding before consuming. Conditional update is the atomic replay gate. */
export async function consumeOAuthState(state: string, binding: OAuthStateBinding) {
  if (!state || state.length > 200 || !binding.userId || !binding.workspaceId) return null;
  const where = { state, ...binding, consumedAt: null, expiresAt: { gt: new Date() } };
  const record = await prisma.oAuthState.findFirst({ where });
  if (!record) return null;
  const claimed = await prisma.oAuthState.updateMany({
    where: { id: record.id, ...where },
    data: { consumedAt: new Date(), codeVerifier: null }
  });
  return claimed.count === 1 ? record : null;
}

export function buildAuthorizationUrl(config: OAuthConfig, params: { state: string; redirectUri: string; codeVerifier?: string }): string {
  const url = new URL(config.authorizationUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', params.state);
  if (config.scopes.length) {
    url.searchParams.set('scope', config.scopes.join(config.scopeSeparator ?? ' '));
  }
  if (config.pkce && params.codeVerifier) {
    url.searchParams.set('code_challenge', codeChallengeFromVerifier(params.codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
  }
  for (const [k, v] of Object.entries(config.extraAuthParams ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

export interface TokenRequestOptions {
  config: OAuthConfig;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}

/** Yetkilendirme kodunu token ile değiştirir. */
export async function exchangeAuthorizationCode(opts: TokenRequestOptions): Promise<TokenSet> {
  const { config, code, redirectUri, codeVerifier } = opts;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret
  });
  if (config.pkce && codeVerifier) body.set('code_verifier', codeVerifier);

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json'
  };
  if (config.clientAuth === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
  }

  const res = await fetch(config.tokenUrl, { method: 'POST', headers, body: body.toString() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Token değişimi başarısız (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return normalizeTokenResponse(JSON.parse(text));
}

export async function refreshAccessToken(config: OAuthConfig, refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret
  });
  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString()
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token yenileme başarısız (HTTP ${res.status}): ${text.slice(0, 300)}`);
  return normalizeTokenResponse(JSON.parse(text));
}

export function normalizeTokenResponse(json: any): TokenSet {
  return {
    accessToken: String(json.access_token ?? ''),
    refreshToken: json.refresh_token ? String(json.refresh_token) : null,
    tokenType: json.token_type ? String(json.token_type) : 'Bearer',
    scope: json.scope ? String(json.scope) : undefined,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : null,
    refreshExpiresIn:
      typeof json.refresh_token_expires_in === 'number'
        ? json.refresh_token_expires_in
        : typeof json.refresh_expires_in === 'number'
          ? json.refresh_expires_in
          : null
  };
}

export function tokenSetToExpiry(token: TokenSet): { expiresAt: Date | null; refreshExpiresAt: Date | null } {
  const now = Date.now();
  return {
    expiresAt: token.expiresIn ? new Date(now + (token.expiresIn - 60) * 1000) : null,
    refreshExpiresAt: token.refreshExpiresIn ? new Date(now + (token.refreshExpiresIn - 60) * 1000) : null
  };
}

/** Uzun ömürlü sayfa token'ı gibi türetmeler için basit GET çağrısı. */
export async function apiGet<T = any>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Sağlayıcı geçersiz JSON döndürdü.');
  }
}
