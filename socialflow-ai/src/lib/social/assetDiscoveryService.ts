import prisma from '@/lib/prisma';
import { toCipherText, fromCipherText } from '@/lib/crypto';
import type { SessionContext } from '@/lib/auth/session';
import type { PlatformCode } from '@/lib/platforms/platforms';
import { checkSocialAccountHealth } from './accountHealth';

export type DiscoveredAssetType =
  | 'ORGANIC_PAGE'
  | 'ORGANIC_PROFILE'
  | 'INSTAGRAM_BUSINESS'
  | 'YOUTUBE_CHANNEL'
  | 'AD_ACCOUNT'
  | 'PINTEREST_BOARD';

export interface DiscoveredAsset {
  id: string; // generated unique asset key
  provider: string; // META, GOOGLE, LINKEDIN, TIKTOK, X, PINTEREST, SNAPCHAT, THREADS
  type: DiscoveredAssetType;
  externalId: string;
  name: string;
  handle?: string;
  avatarUrl?: string | null;
  currency?: string | null;
  timezone?: string | null;
  status: string;
  permissions: string[];
  meta?: Record<string, unknown>;
  // Security: Plaintext token is only held in memory during discovery session
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scope?: string;
}

export interface DiscoveredAssetSummary {
  id: string;
  provider: string;
  type: DiscoveredAssetType;
  externalId: string;
  name: string;
  handle?: string;
  avatarUrl?: string | null;
  currency?: string | null;
  timezone?: string | null;
  status: string;
  permissions: string[];
  alreadyConnected: boolean;
  connectedAccountId?: string | null;
}

// In-memory discovery store with 15-minute expiration
const discoveryCache = new Map<string, {
  userId: string;
  workspaceId: string;
  provider: string;
  assets: DiscoveredAsset[];
  createdAt: number;
}>();

export function storeDiscoverySession(key: string, data: {
  userId: string;
  workspaceId: string;
  provider: string;
  assets: DiscoveredAsset[];
}) {
  // Purge old
  const now = Date.now();
  for (const [k, v] of discoveryCache.entries()) {
    if (now - v.createdAt > 15 * 60 * 1000) discoveryCache.delete(k);
  }
  discoveryCache.set(key, { ...data, createdAt: now });
}

export function getDiscoverySession(key: string, workspaceId: string) {
  const session = discoveryCache.get(key);
  if (!session) return null;
  if (session.workspaceId !== workspaceId) return null;
  if (Date.now() - session.createdAt > 15 * 60 * 1000) {
    discoveryCache.delete(key);
    return null;
  }
  return session;
}

/**
 * Discover all accessible assets across social & advertising for a given provider and token.
 */
export async function discoverProviderAssets(params: {
  provider: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scope?: string;
  mode?: 'ORGANIC' | 'ADS' | 'ALL';
}): Promise<DiscoveredAsset[]> {
  const { provider, accessToken, refreshToken, expiresAt, scope, mode = 'ALL' } = params;
  const normalized = provider.toUpperCase();
  const assets: DiscoveredAsset[] = [];

  const commonToken = {
    accessToken,
    refreshToken,
    expiresAt,
    scope
  };

  try {
    if (normalized === 'META') {
      // 1. Discover Facebook Pages & Linked Instagram Accounts
      if (mode === 'ORGANIC' || mode === 'ALL') {
        const pagesRes = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,picture,category,access_token,instagram_business_account{id,username,name,profile_picture_url}&limit=50`,
          { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }
        ).catch(() => null);

        if (pagesRes && pagesRes.ok) {
          const pagesData = await pagesRes.json().catch(() => null);
          const items = Array.isArray(pagesData?.data) ? pagesData.data : [];

          for (const page of items) {
            // Facebook Page
            assets.push({
              id: `meta_page_${page.id}`,
              provider: 'META',
              type: 'ORGANIC_PAGE',
              externalId: String(page.id),
              name: String(page.name || 'Facebook Sayfası'),
              handle: `@${page.name?.replace(/\s+/g, '').toLowerCase() || page.id}`,
              avatarUrl: page.picture?.data?.url || null,
              status: 'ACTIVE',
              permissions: ['pages_manage_posts', 'pages_read_engagement'],
              accessToken: page.access_token || accessToken, // use page token if available
              refreshToken,
              expiresAt: null, // Facebook page tokens are often perpetual or long-lived
              scope
            });

            // Linked Instagram Business Account
            if (page.instagram_business_account?.id) {
              const ig = page.instagram_business_account;
              assets.push({
                id: `meta_ig_${ig.id}`,
                provider: 'META',
                type: 'INSTAGRAM_BUSINESS',
                externalId: String(ig.id),
                name: String(ig.name || ig.username || 'Instagram Hesabı'),
                handle: `@${ig.username || ig.id}`,
                avatarUrl: ig.profile_picture_url || null,
                status: 'ACTIVE',
                permissions: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'],
                accessToken: page.access_token || accessToken,
                refreshToken,
                expiresAt,
                scope
              });
            }
          }
        }
      }

      // 2. Discover Meta Ad Accounts
      if (mode === 'ADS' || mode === 'ALL') {
        const adsRes = await fetch(
          `https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id,name,currency,timezone_name,account_status&limit=50`,
          { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }
        ).catch(() => null);

        if (adsRes && adsRes.ok) {
          const adsData = await adsRes.json().catch(() => null);
          const items = Array.isArray(adsData?.data) ? adsData.data : [];

          for (const ad of items) {
            assets.push({
              id: `meta_ad_${ad.account_id || ad.id}`,
              provider: 'META',
              type: 'AD_ACCOUNT',
              externalId: String(ad.account_id || ad.id).replace(/^act_/, ''),
              name: String(ad.name || `Meta Ad Account ${ad.account_id || ad.id}`),
              currency: ad.currency || 'USD',
              timezone: ad.timezone_name || 'Europe/Istanbul',
              status: ad.account_status === 1 ? 'ACTIVE' : 'DISABLED',
              permissions: ['ads_management', 'ads_read'],
              accessToken,
              refreshToken,
              expiresAt,
              scope
            });
          }
        }
      }
    } else if (normalized === 'GOOGLE') {
      // 1. YouTube Channels
      const ytRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }
      ).catch(() => null);

      if (ytRes && ytRes.ok) {
        const ytData = await ytRes.json().catch(() => null);
        const items = Array.isArray(ytData?.items) ? ytData.items : [];

        for (const item of items) {
          assets.push({
            id: `google_yt_${item.id}`,
            provider: 'GOOGLE',
            type: 'YOUTUBE_CHANNEL',
            externalId: String(item.id),
            name: String(item.snippet?.title || 'YouTube Kanalı'),
            handle: item.snippet?.customUrl ? `@${item.snippet.customUrl.replace(/^@/, '')}` : `@${item.snippet?.title || item.id}`,
            avatarUrl: item.snippet?.thumbnails?.default?.url || null,
            status: 'ACTIVE',
            permissions: ['youtube.upload', 'youtube.readonly'],
            meta: { subscriberCount: item.statistics?.subscriberCount },
            ...commonToken
          });
        }
      }

      // 2. Google Ads Accessible Customers (if adwords scope is granted)
      if ((mode === 'ADS' || mode === 'ALL') && scope?.includes('adwords')) {
        const gAdsRes = await fetch(
          'https://googleads.googleapis.com/v17/customers:listAccessibleCustomers',
          { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }
        ).catch(() => null);

        if (gAdsRes && gAdsRes.ok) {
          const gAdsData = await gAdsRes.json().catch(() => null);
          const resourceNames = Array.isArray(gAdsData?.resourceNames) ? gAdsData.resourceNames : [];

          for (const resName of resourceNames) {
            const customerId = String(resName).replace('customers/', '');
            assets.push({
              id: `google_ad_${customerId}`,
              provider: 'GOOGLE',
              type: 'AD_ACCOUNT',
              externalId: customerId,
              name: `Google Ads Müşteri Hesabı (${customerId})`,
              currency: 'TRY',
              timezone: 'Europe/Istanbul',
              status: 'ACTIVE',
              permissions: ['adwords'],
              ...commonToken
            });
          }
        }
      }
    } else if (normalized === 'LINKEDIN') {
      // 1. LinkedIn Profile
      const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null);

      if (meRes && meRes.ok) {
        const me = await meRes.json().catch(() => null);
        if (me && me.sub) {
          assets.push({
            id: `linkedin_profile_${me.sub}`,
            provider: 'LINKEDIN',
            type: 'ORGANIC_PROFILE',
            externalId: String(me.sub),
            name: String(me.name || `${me.given_name || ''} ${me.family_name || ''}`.trim() || 'LinkedIn Profili'),
            handle: `@${me.preferred_username || me.email?.split('@')[0] || me.sub}`,
            avatarUrl: me.picture || null,
            status: 'ACTIVE',
            permissions: ['w_member_social'],
            ...commonToken
          });
        }
      }

      // 2. LinkedIn Organizations
      const orgsRes = await fetch(
        'https://api.linkedin.com/rest/organizationalEntityAcls?q=roleAssignee&state=APPROVED',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'LinkedIn-Version': '202409',
            'X-Restli-Protocol-Version': '2.0.0',
            Accept: 'application/json'
          },
          signal: AbortSignal.timeout(15_000)
        }
      ).catch(() => null);

      if (orgsRes && orgsRes.ok) {
        const orgsData = await orgsRes.json().catch(() => null);
        const elements = Array.isArray(orgsData?.elements) ? orgsData.elements : [];

        for (const el of elements) {
          const orgUrn = el.organizationalTarget;
          if (orgUrn) {
            const orgId = String(orgUrn).replace('urn:li:organization:', '');
            assets.push({
              id: `linkedin_org_${orgId}`,
              provider: 'LINKEDIN',
              type: 'ORGANIC_PAGE',
              externalId: orgId,
              name: `LinkedIn Şirket Sayfası (${orgId})`,
              handle: `@company-${orgId}`,
              status: 'ACTIVE',
              permissions: ['w_organization_social'],
              ...commonToken
            });
          }
        }
      }
    } else if (normalized === 'TIKTOK') {
      const ttRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null);

      if (ttRes && ttRes.ok) {
        const ttData = await ttRes.json().catch(() => null);
        const user = ttData?.data?.user;
        if (user && user.open_id) {
          assets.push({
            id: `tiktok_${user.open_id}`,
            provider: 'TIKTOK',
            type: 'ORGANIC_PROFILE',
            externalId: String(user.open_id),
            name: String(user.display_name || 'TikTok Hesabı'),
            handle: `@${user.display_name?.replace(/\s+/g, '').toLowerCase() || 'tiktok'}`,
            avatarUrl: user.avatar_url || null,
            status: 'ACTIVE',
            permissions: ['video.publish', 'video.upload'],
            ...commonToken
          });
        }
      }
    } else if (normalized === 'X') {
      const xRes = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url,public_metrics,username', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null);

      if (xRes && xRes.ok) {
        const xData = await xRes.json().catch(() => null);
        const user = xData?.data;
        if (user && user.id) {
          assets.push({
            id: `x_${user.id}`,
            provider: 'X',
            type: 'ORGANIC_PROFILE',
            externalId: String(user.id),
            name: String(user.name || user.username || 'X Hesabı'),
            handle: `@${user.username}`,
            avatarUrl: user.profile_image_url || null,
            status: 'ACTIVE',
            permissions: ['tweet.read', 'tweet.write'],
            meta: { followersCount: user.public_metrics?.followers_count },
            ...commonToken
          });
        }
      }
    } else if (normalized === 'PINTEREST') {
      const piRes = await fetch('https://api.pinterest.com/v5/user_account', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null);

      if (piRes && piRes.ok) {
        const piData = await piRes.json().catch(() => null);
        if (piData && piData.username) {
          assets.push({
            id: `pinterest_${piData.username}`,
            provider: 'PINTEREST',
            type: 'ORGANIC_PROFILE',
            externalId: String(piData.username),
            name: String(piData.business_name || piData.username || 'Pinterest Hesabı'),
            handle: `@${piData.username}`,
            avatarUrl: piData.profile_image || null,
            status: 'ACTIVE',
            permissions: ['boards:read', 'boards:write', 'pins:read', 'pins:write'],
            ...commonToken
          });
        }
      }
    } else if (normalized === 'THREADS') {
      const thRes = await fetch('https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null);

      if (thRes && thRes.ok) {
        const thData = await thRes.json().catch(() => null);
        if (thData && thData.id) {
          assets.push({
            id: `threads_${thData.id}`,
            provider: 'THREADS',
            type: 'ORGANIC_PROFILE',
            externalId: String(thData.id),
            name: String(thData.name || thData.username || 'Threads'),
            handle: `@${thData.username || 'threads'}`,
            avatarUrl: thData.threads_profile_picture_url || null,
            status: 'ACTIVE',
            permissions: ['threads_basic', 'threads_content_publish'],
            ...commonToken
          });
        }
      }
    }
  } catch (err) {
    console.error(`[discoverProviderAssets] Error discovering assets for ${provider}:`, err);
  }

  return assets;
}

/**
 * Summarize discovered assets against existing database connections for a workspace.
 */
export async function getDiscoveredAssetsSummary(
  sessionKey: string,
  workspaceId: string
): Promise<{
  provider: string;
  items: DiscoveredAssetSummary[];
} | null> {
  const session = getDiscoverySession(sessionKey, workspaceId);
  if (!session) return null;

  // Load existing accounts for this workspace to mark already connected
  const [existingSocial, existingAds] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { workspaceId },
      select: { id: true, platform: true, externalId: true, handle: true }
    }),
    prisma.adAccount.findMany({
      where: { workspaceId },
      select: { id: true, provider: true, providerAccountId: true }
    })
  ]);

  const socialMap = new Map(existingSocial.map(s => [`${s.platform}:${s.externalId || s.handle}`, s.id]));
  const adMap = new Map(existingAds.map(a => [`${a.provider}:${a.providerAccountId}`, a.id]));

  const items: DiscoveredAssetSummary[] = session.assets.map(asset => {
    let alreadyConnected = false;
    let connectedAccountId: string | null = null;

    if (asset.type === 'AD_ACCOUNT') {
      const match = adMap.get(`${asset.provider}:${asset.externalId}`);
      if (match) {
        alreadyConnected = true;
        connectedAccountId = match;
      }
    } else {
      const targetPlatform = asset.type === 'INSTAGRAM_BUSINESS' ? 'INSTAGRAM' :
        asset.type === 'ORGANIC_PAGE' ? (asset.provider === 'META' ? 'FACEBOOK' : asset.provider) :
        asset.type === 'YOUTUBE_CHANNEL' ? 'YOUTUBE' :
        asset.provider;

      const match = socialMap.get(`${targetPlatform}:${asset.externalId}`) || (asset.handle ? socialMap.get(`${targetPlatform}:${asset.handle}`) : null);
      if (match) {
        alreadyConnected = true;
        connectedAccountId = match;
      }
    }

    return {
      id: asset.id,
      provider: asset.provider,
      type: asset.type,
      externalId: asset.externalId,
      name: asset.name,
      handle: asset.handle,
      avatarUrl: asset.avatarUrl,
      currency: asset.currency,
      timezone: asset.timezone,
      status: asset.status,
      permissions: asset.permissions,
      alreadyConnected,
      connectedAccountId
    };
  });

  return {
    provider: session.provider,
    items
  };
}

/**
 * Import a selected asset from the discovery session into the customer's workspace.
 */
export async function importSelectedAsset(params: {
  sessionKey: string;
  assetId: string;
  brandId?: string | null;
  displayName?: string;
  userContext: SessionContext;
}) {
  const { sessionKey, assetId, brandId, displayName, userContext } = params;
  const workspaceId = userContext.user.workspaceId;
  const userId = userContext.user.id;

  const session = getDiscoverySession(sessionKey, workspaceId);
  if (!session) {
    throw new Error('Bağlantı oturumunun süresi dolmuş veya geçersiz. Lütfen bağlantıyı yeniden başlatın.');
  }

  const asset = session.assets.find(a => a.id === assetId);
  if (!asset) {
    throw new Error('Seçilen hesap bağlantı oturumunda bulunamadı.');
  }

  // Verify brand belongs to workspace if supplied
  if (brandId) {
    const brand = await prisma.brand.findFirst({ where: { id: brandId, workspaceId } });
    if (!brand) throw new Error('Seçilen marka bu çalışma alanına ait değil.');
  }

  if (asset.type === 'AD_ACCOUNT') {
    // Save to AdAccount and AdAccountCredential
    const existing = await prisma.adAccount.findFirst({
      where: {
        workspaceId,
        provider: asset.provider,
        providerAccountId: asset.externalId
      }
    });

    let adAccount;
    if (existing) {
      adAccount = await prisma.adAccount.update({
        where: { id: existing.id },
        data: {
          brandId: brandId || existing.brandId,
          displayName: displayName || asset.name || existing.displayName,
          currency: asset.currency || existing.currency,
          timezone: asset.timezone || existing.timezone,
          connectionStatus: 'CONNECTED',
          grantedScopes: JSON.stringify(asset.permissions),
          lastValidatedAt: new Date(),
          updatedAt: new Date()
        }
      });
    } else {
      adAccount = await prisma.adAccount.create({
        data: {
          workspaceId,
          brandId: brandId || null,
          provider: asset.provider,
          providerAccountId: asset.externalId,
          displayName: displayName || asset.name,
          currency: asset.currency || 'USD',
          timezone: asset.timezone || 'Europe/Istanbul',
          connectionStatus: 'CONNECTED',
          grantedScopes: JSON.stringify(asset.permissions),
          lastValidatedAt: new Date()
        }
      });
    }

    // Upsert encrypted credential
    await prisma.adAccountCredential.upsert({
      where: { adAccountId: adAccount.id },
      update: {
        accessTokenEnc: toCipherText(asset.accessToken),
        refreshTokenEnc: asset.refreshToken ? toCipherText(asset.refreshToken) : null,
        expiresAt: asset.expiresAt || null,
        lastRotatedAt: new Date()
      },
      create: {
        workspaceId,
        adAccountId: adAccount.id,
        accessTokenEnc: toCipherText(asset.accessToken),
        refreshTokenEnc: asset.refreshToken ? toCipherText(asset.refreshToken) : null,
        expiresAt: asset.expiresAt || null,
        lastRotatedAt: new Date()
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'ad_account.connected',
        entityType: 'AdAccount',
        entityId: adAccount.id,
        metadata: JSON.stringify({
          provider: asset.provider,
          providerAccountId: asset.externalId,
          name: adAccount.displayName
        })
      }
    });

    return {
      type: 'AD_ACCOUNT' as const,
      id: adAccount.id,
      displayName: adAccount.displayName,
      provider: adAccount.provider,
      connectionStatus: adAccount.connectionStatus
    };
  } else {
    // Save to SocialAccount and SocialProviderToken
    const platform = (
      asset.type === 'INSTAGRAM_BUSINESS' ? 'INSTAGRAM' :
      asset.type === 'ORGANIC_PAGE' ? (asset.provider === 'META' ? 'FACEBOOK' : asset.provider) :
      asset.type === 'YOUTUBE_CHANNEL' ? 'YOUTUBE' :
      asset.provider
    ) as PlatformCode;

    const handle = asset.handle || `@${asset.name.replace(/\s+/g, '').toLowerCase()}`;
    const accountType = (
      asset.type === 'INSTAGRAM_BUSINESS' ? 'BUSINESS' :
      asset.type === 'ORGANIC_PAGE' ? 'PAGE' :
      asset.type === 'YOUTUBE_CHANNEL' ? 'CHANNEL' :
      'PROFILE'
    );

    const existing = await prisma.socialAccount.findFirst({
      where: {
        workspaceId,
        platform,
        OR: [
          { externalId: asset.externalId },
          { handle }
        ]
      }
    });

    let socialAccount;
    if (existing) {
      socialAccount = await prisma.socialAccount.update({
        where: { id: existing.id },
        data: {
          brandId: brandId || existing.brandId,
          displayName: displayName || asset.name || existing.displayName,
          handle,
          externalId: asset.externalId,
          avatarUrl: asset.avatarUrl || existing.avatarUrl,
          accountType,
          demoAccount: false,
          connectionStatus: 'ACTIVE',
          scopes: asset.permissions.join(','),
          lastValidatedAt: new Date(),
          lastError: null,
          updatedAt: new Date()
        }
      });
    } else {
      socialAccount = await prisma.socialAccount.create({
        data: {
          workspaceId,
          brandId: brandId || null,
          platform,
          externalId: asset.externalId,
          displayName: displayName || asset.name,
          handle,
          avatarUrl: asset.avatarUrl || null,
          accountType,
          demoAccount: false,
          connectionStatus: 'ACTIVE',
          scopes: asset.permissions.join(','),
          lastValidatedAt: new Date()
        }
      });
    }

    // Upsert encrypted token
    await prisma.socialProviderToken.upsert({
      where: { socialAccountId: socialAccount.id },
      update: {
        accessTokenEnc: toCipherText(asset.accessToken),
        refreshTokenEnc: asset.refreshToken ? toCipherText(asset.refreshToken) : null,
        tokenType: 'Bearer',
        scope: asset.scope || asset.permissions.join(' '),
        expiresAt: asset.expiresAt || null,
        lastRefreshedAt: new Date()
      },
      create: {
        socialAccountId: socialAccount.id,
        accessTokenEnc: toCipherText(asset.accessToken),
        refreshTokenEnc: asset.refreshToken ? toCipherText(asset.refreshToken) : null,
        tokenType: 'Bearer',
        scope: asset.scope || asset.permissions.join(' '),
        expiresAt: asset.expiresAt || null,
        lastRefreshedAt: new Date()
      }
    });

    // Run immediate health check
    await checkSocialAccountHealth(socialAccount.id).catch(() => undefined);

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'social_account.connected',
        entityType: 'SocialAccount',
        entityId: socialAccount.id,
        metadata: JSON.stringify({
          platform,
          externalId: asset.externalId,
          handle,
          displayName: socialAccount.displayName
        })
      }
    });

    return {
      type: 'SOCIAL_ACCOUNT' as const,
      id: socialAccount.id,
      displayName: socialAccount.displayName,
      platform: socialAccount.platform,
      handle: socialAccount.handle,
      connectionStatus: socialAccount.connectionStatus
    };
  }
}
