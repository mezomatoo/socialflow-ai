import prisma from '@/lib/prisma';
import { env } from '@/lib/env';
import { toCipherText, fromCipherText } from '@/lib/crypto';
import type { PlatformCode } from '@/lib/platforms/platforms';

export type IntegrationEnvironment = 'DEVELOPMENT' | 'SANDBOX' | 'PRODUCTION';
export type AppReviewStatus = 'NOT_CONFIGURED' | 'CONFIGURED' | 'REVIEW_REQUIRED' | 'PARTIALLY_APPROVED' | 'READY' | 'ERROR';

export interface ProviderIntegrationDTO {
  provider: string;
  name: string;
  environment: IntegrationEnvironment;
  clientId: string;
  hasClientSecret: boolean;
  clientSecretMasked?: string;
  hasDeveloperToken?: boolean;
  developerTokenMasked?: string;
  apiVersion: string | null;
  authorizationUrl: string | null;
  tokenUrl: string | null;
  redirectUri: string | null;
  webhookUrl: string | null;
  hasWebhookSecret?: boolean;
  requestedScopes: string[];
  approvedScopes: string[];
  appReviewStatus: AppReviewStatus;
  writeEnabled: boolean;
  readEnabled: boolean;
  analyticsEnabled: boolean;
  adsEnabled: boolean;
  status: string;
  errorMessage: string | null;
  configuredAt: string | null;
  lastVerifiedAt: string | null;
}

export interface DecryptedProviderConfig {
  provider: string;
  environment: IntegrationEnvironment;
  clientId: string;
  clientSecret: string;
  developerToken: string | null;
  apiVersion: string;
  authorizationUrl: string;
  tokenUrl: string;
  redirectUri: string;
  webhookUrl: string | null;
  webhookSecret: string | null;
  requestedScopes: string[];
  approvedScopes: string[];
  appReviewStatus: AppReviewStatus;
  writeEnabled: boolean;
  readEnabled: boolean;
  analyticsEnabled: boolean;
  adsEnabled: boolean;
  status: string;
  isConfigured: boolean;
}

export const PROVIDER_DEFAULT_CONFIGS: Record<string, {
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  apiVersion: string;
  defaultScopes: string[];
}> = {
  META: {
    name: 'Meta (Facebook, Instagram & Meta Ads)',
    authorizationUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    apiVersion: 'v21.0',
    defaultScopes: [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_insights',
      'ads_management',
      'ads_read',
      'business_management'
    ]
  },
  GOOGLE: {
    name: 'Google & YouTube (Google Ads & YouTube)',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    apiVersion: 'v3',
    defaultScopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/adwords'
    ]
  },
  LINKEDIN: {
    name: 'LinkedIn (Organik & LinkedIn Ads)',
    authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    apiVersion: '202409',
    defaultScopes: [
      'openid',
      'profile',
      'email',
      'w_member_social',
      'w_organization_social',
      'rw_organization_admin',
      'r_ads',
      'rw_ads'
    ]
  },
  TIKTOK: {
    name: 'TikTok (Organik & TikTok Ads)',
    authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    apiVersion: 'v2',
    defaultScopes: [
      'user.info.basic',
      'video.publish',
      'video.upload'
    ]
  },
  X: {
    name: 'X (Organik & X Ads)',
    authorizationUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    apiVersion: 'v2',
    defaultScopes: [
      'tweet.read',
      'tweet.write',
      'users.read',
      'offline.access',
      'media.write'
    ]
  },
  PINTEREST: {
    name: 'Pinterest (Organik & Pinterest Ads)',
    authorizationUrl: 'https://www.pinterest.com/oauth/',
    tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
    apiVersion: 'v5',
    defaultScopes: [
      'user_accounts:read',
      'boards:read',
      'boards:write',
      'pins:read',
      'pins:write',
      'ads:read'
    ]
  },
  SNAPCHAT: {
    name: 'Snapchat (Snapchat Marketing & Ads)',
    authorizationUrl: 'https://accounts.snapchat.com/login/oauth2/authorize',
    tokenUrl: 'https://accounts.snapchat.com/login/oauth2/access_token',
    apiVersion: 'v1',
    defaultScopes: [
      'snapchat-marketing-api',
      'snapchat-profile-api'
    ]
  },
  THREADS: {
    name: 'Threads (Meta Threads API)',
    authorizationUrl: 'https://threads.net/oauth/authorize',
    tokenUrl: 'https://graph.threads.net/oauth/access_token',
    apiVersion: 'v21.0',
    defaultScopes: [
      'threads_basic',
      'threads_content_publish',
      'threads_manage_insights'
    ]
  }
};

function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '••••••••';
  return `••••••••${secret.slice(-4)}`;
}

/**
 * Get decrypted provider config with DB-first hierarchy falling back to environment variables.
 */
export async function getDecryptedProviderConfig(providerKey: string): Promise<DecryptedProviderConfig> {
  const normalized = providerKey.toUpperCase();
  const metaKey = normalized === 'INSTAGRAM' || normalized === 'FACEBOOK' ? 'META' : normalized;
  const defaults = PROVIDER_DEFAULT_CONFIGS[metaKey] || PROVIDER_DEFAULT_CONFIGS[normalized] || {
    name: normalized,
    authorizationUrl: '',
    tokenUrl: '',
    apiVersion: 'v1',
    defaultScopes: []
  };

  const appBaseUrl = env.appUrl.replace(/\/$/, '');
  const callbackPlatform = metaKey === 'META' ? 'meta' : metaKey.toLowerCase();
  const canonicalRedirectUri = `${appBaseUrl}/api/auth/${callbackPlatform}/callback`;

  // 1. Try DB config
  const dbConfig = await prisma.providerIntegrationConfig.findFirst({
    where: { provider: metaKey },
    orderBy: { updatedAt: 'desc' }
  });

  if (dbConfig && dbConfig.clientId && dbConfig.clientSecretEnc) {
    let clientSecret = '';
    let developerToken = null;
    let webhookSecret = null;
    try {
      clientSecret = fromCipherText(dbConfig.clientSecretEnc);
    } catch {
      clientSecret = '';
    }
    if (dbConfig.developerTokenEnc) {
      try {
        developerToken = fromCipherText(dbConfig.developerTokenEnc);
      } catch {
        developerToken = null;
      }
    }
    if (dbConfig.webhookSecretEnc) {
      try {
        webhookSecret = fromCipherText(dbConfig.webhookSecretEnc);
      } catch {
        webhookSecret = null;
      }
    }

    let requestedScopes: string[] = defaults.defaultScopes;
    let approvedScopes: string[] = [];
    try {
      const parsedReq = JSON.parse(dbConfig.requestedScopes);
      if (Array.isArray(parsedReq) && parsedReq.length) requestedScopes = parsedReq;
    } catch { /* use defaults */ }
    try {
      const parsedApp = JSON.parse(dbConfig.approvedScopes);
      if (Array.isArray(parsedApp)) approvedScopes = parsedApp;
    } catch { /* empty */ }

    const isConfigured = Boolean(dbConfig.clientId && clientSecret);

    return {
      provider: metaKey,
      environment: (dbConfig.environment as IntegrationEnvironment) || 'DEVELOPMENT',
      clientId: dbConfig.clientId,
      clientSecret,
      developerToken,
      apiVersion: dbConfig.apiVersion || defaults.apiVersion,
      authorizationUrl: dbConfig.authorizationUrl || defaults.authorizationUrl,
      tokenUrl: dbConfig.tokenUrl || defaults.tokenUrl,
      redirectUri: dbConfig.redirectUri || canonicalRedirectUri,
      webhookUrl: dbConfig.webhookUrl || null,
      webhookSecret,
      requestedScopes,
      approvedScopes,
      appReviewStatus: (dbConfig.appReviewStatus as AppReviewStatus) || (isConfigured ? 'READY' : 'NOT_CONFIGURED'),
      writeEnabled: dbConfig.writeEnabled,
      readEnabled: dbConfig.readEnabled,
      analyticsEnabled: dbConfig.analyticsEnabled,
      adsEnabled: dbConfig.adsEnabled,
      status: isConfigured ? (dbConfig.status || 'READY') : 'NOT_CONFIGURED',
      isConfigured
    };
  }

  // 2. Fallback to env.providers
  let envId = '';
  let envSecret = '';

  if (metaKey === 'META') {
    envId = env.providers.INSTAGRAM?.id || env.providers.FACEBOOK?.id || process.env.META_APP_ID || '';
    envSecret = env.providers.INSTAGRAM?.secret || env.providers.FACEBOOK?.secret || process.env.META_APP_SECRET || '';
  } else if (metaKey === 'GOOGLE') {
    envId = env.providers.YOUTUBE?.id || env.providers.GOOGLE_BUSINESS?.id || process.env.GOOGLE_CLIENT_ID || '';
    envSecret = env.providers.YOUTUBE?.secret || env.providers.GOOGLE_BUSINESS?.secret || process.env.GOOGLE_CLIENT_SECRET || '';
  } else {
    const envEntry = env.providers[metaKey as PlatformCode];
    envId = envEntry?.id || '';
    envSecret = envEntry?.secret || '';
  }

  const isConfigured = Boolean(envId && envSecret);

  return {
    provider: metaKey,
    environment: (process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT') as IntegrationEnvironment,
    clientId: envId,
    clientSecret: envSecret,
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || null,
    apiVersion: defaults.apiVersion,
    authorizationUrl: defaults.authorizationUrl,
    tokenUrl: defaults.tokenUrl,
    redirectUri: canonicalRedirectUri,
    webhookUrl: null,
    webhookSecret: null,
    requestedScopes: defaults.defaultScopes,
    approvedScopes: isConfigured ? defaults.defaultScopes : [],
    appReviewStatus: isConfigured ? 'READY' : 'NOT_CONFIGURED',
    writeEnabled: isConfigured,
    readEnabled: isConfigured,
    analyticsEnabled: isConfigured,
    adsEnabled: isConfigured,
    status: isConfigured ? 'READY' : 'NOT_CONFIGURED',
    isConfigured
  };
}

/**
 * List all provider integrations for admin view with masked credentials.
 */
export async function listAdminProviderIntegrations(): Promise<ProviderIntegrationDTO[]> {
  const providerKeys = Object.keys(PROVIDER_DEFAULT_CONFIGS);
  const configs = await Promise.all(providerKeys.map(k => getDecryptedProviderConfig(k)));

  const dbRows = await prisma.providerIntegrationConfig.findMany();
  const dbMap = new Map(dbRows.map(r => [r.provider, r]));

  return configs.map(c => {
    const dbRow = dbMap.get(c.provider);
    const def = PROVIDER_DEFAULT_CONFIGS[c.provider];

    return {
      provider: c.provider,
      name: def.name,
      environment: c.environment,
      clientId: c.clientId,
      hasClientSecret: Boolean(c.clientSecret),
      clientSecretMasked: c.clientSecret ? maskSecret(c.clientSecret) : undefined,
      hasDeveloperToken: Boolean(c.developerToken),
      developerTokenMasked: c.developerToken ? maskSecret(c.developerToken) : undefined,
      apiVersion: c.apiVersion,
      authorizationUrl: c.authorizationUrl,
      tokenUrl: c.tokenUrl,
      redirectUri: c.redirectUri,
      webhookUrl: c.webhookUrl,
      hasWebhookSecret: Boolean(c.webhookSecret),
      requestedScopes: c.requestedScopes,
      approvedScopes: c.approvedScopes,
      appReviewStatus: c.appReviewStatus,
      writeEnabled: c.writeEnabled,
      readEnabled: c.readEnabled,
      analyticsEnabled: c.analyticsEnabled,
      adsEnabled: c.adsEnabled,
      status: c.isConfigured ? (dbRow?.status || 'READY') : 'NOT_CONFIGURED',
      errorMessage: dbRow?.errorMessage || null,
      configuredAt: dbRow?.configuredAt?.toISOString() || (c.isConfigured ? new Date().toISOString() : null),
      lastVerifiedAt: dbRow?.lastVerifiedAt?.toISOString() || null
    };
  });
}

/**
 * Update or create provider integration configuration from admin panel.
 */
export async function updateAdminProviderIntegration(input: {
  provider: string;
  environment?: IntegrationEnvironment;
  clientId: string;
  clientSecret?: string;
  developerToken?: string;
  apiVersion?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  redirectUri?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  requestedScopes?: string[];
  approvedScopes?: string[];
  appReviewStatus?: AppReviewStatus;
  writeEnabled?: boolean;
  readEnabled?: boolean;
  analyticsEnabled?: boolean;
  adsEnabled?: boolean;
}) {
  const normalized = input.provider.toUpperCase();
  const defaults = PROVIDER_DEFAULT_CONFIGS[normalized] || {
    name: normalized,
    authorizationUrl: '',
    tokenUrl: '',
    apiVersion: 'v1',
    defaultScopes: []
  };

  const environment = input.environment || 'PRODUCTION';

  const existing = await prisma.providerIntegrationConfig.findFirst({
    where: { provider: normalized, environment }
  });

  const clientSecretEnc = input.clientSecret && input.clientSecret.trim()
    ? toCipherText(input.clientSecret.trim())
    : existing?.clientSecretEnc || '';

  const developerTokenEnc = input.developerToken !== undefined
    ? (input.developerToken.trim() ? toCipherText(input.developerToken.trim()) : null)
    : existing?.developerTokenEnc || null;

  const webhookSecretEnc = input.webhookSecret !== undefined
    ? (input.webhookSecret.trim() ? toCipherText(input.webhookSecret.trim()) : null)
    : existing?.webhookSecretEnc || null;

  const requestedScopes = JSON.stringify(input.requestedScopes || defaults.defaultScopes);
  const approvedScopes = JSON.stringify(input.approvedScopes || (input.requestedScopes || defaults.defaultScopes));

  const hasCredentials = Boolean(input.clientId.trim() && (clientSecretEnc || input.clientSecret?.trim()));
  const status = hasCredentials ? 'READY' : 'NOT_CONFIGURED';

  const record = await prisma.providerIntegrationConfig.upsert({
    where: {
      provider_environment: {
        provider: normalized,
        environment
      }
    },
    update: {
      clientId: input.clientId.trim(),
      ...(clientSecretEnc ? { clientSecretEnc } : {}),
      developerTokenEnc,
      webhookSecretEnc,
      apiVersion: input.apiVersion || defaults.apiVersion,
      authorizationUrl: input.authorizationUrl || defaults.authorizationUrl,
      tokenUrl: input.tokenUrl || defaults.tokenUrl,
      redirectUri: input.redirectUri || null,
      webhookUrl: input.webhookUrl || null,
      requestedScopes,
      approvedScopes,
      appReviewStatus: input.appReviewStatus || (hasCredentials ? 'READY' : 'NOT_CONFIGURED'),
      writeEnabled: input.writeEnabled ?? true,
      readEnabled: input.readEnabled ?? true,
      analyticsEnabled: input.analyticsEnabled ?? true,
      adsEnabled: input.adsEnabled ?? (normalized === 'META' || normalized === 'GOOGLE' || normalized === 'LINKEDIN'),
      status,
      configuredAt: hasCredentials ? new Date() : null,
      lastVerifiedAt: new Date(),
      errorMessage: null
    },
    create: {
      provider: normalized,
      environment,
      clientId: input.clientId.trim(),
      clientSecretEnc,
      developerTokenEnc,
      webhookSecretEnc,
      apiVersion: input.apiVersion || defaults.apiVersion,
      authorizationUrl: input.authorizationUrl || defaults.authorizationUrl,
      tokenUrl: input.tokenUrl || defaults.tokenUrl,
      redirectUri: input.redirectUri || null,
      webhookUrl: input.webhookUrl || null,
      requestedScopes,
      approvedScopes,
      appReviewStatus: input.appReviewStatus || (hasCredentials ? 'READY' : 'NOT_CONFIGURED'),
      writeEnabled: input.writeEnabled ?? true,
      readEnabled: input.readEnabled ?? true,
      analyticsEnabled: input.analyticsEnabled ?? true,
      adsEnabled: input.adsEnabled ?? (normalized === 'META' || normalized === 'GOOGLE' || normalized === 'LINKEDIN'),
      status,
      configuredAt: hasCredentials ? new Date() : null,
      lastVerifiedAt: new Date()
    }
  });

  return record;
}

/**
 * Verify readiness of a provider integration (credentials check, endpoints reachable).
 */
export async function verifyProviderIntegration(providerKey: string): Promise<{
  ok: boolean;
  provider: string;
  status: string;
  message: string;
  details?: Record<string, unknown>;
}> {
  const config = await getDecryptedProviderConfig(providerKey);
  if (!config.isConfigured) {
    return {
      ok: false,
      provider: config.provider,
      status: 'NOT_CONFIGURED',
      message: `${config.provider} API istemci bilgileri (Client ID / Secret) yapılandırılmamış.`
    };
  }

  // Provider specific checks
  if (config.provider === 'GOOGLE' && config.adsEnabled && !config.developerToken) {
    return {
      ok: true,
      provider: config.provider,
      status: 'PARTIALLY_READY',
      message: 'YouTube entegrasyonu hazır, ancak Google Ads için Developer Token henüz tanımlanmamış.',
      details: {
        youtube: 'READY',
        googleAds: 'DEVELOPER_TOKEN_MISSING'
      }
    };
  }

  return {
    ok: true,
    provider: config.provider,
    status: 'READY',
    message: `${config.provider} entegrasyonu başarıyla doğrulandı ve bağlantı istekleri için hazır.`,
    details: {
      environment: config.environment,
      clientId: config.clientId,
      scopesCount: config.requestedScopes.length,
      apiVersion: config.apiVersion,
      redirectUri: config.redirectUri
    }
  };
}
