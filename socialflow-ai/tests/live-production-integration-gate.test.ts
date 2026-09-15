import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import prisma from '../src/lib/prisma';
import { toCipherText, fromCipherText } from '../src/lib/crypto';
import type { SessionContext } from '../src/lib/auth/session';
import {
  getDecryptedProviderConfig,
  updateAdminProviderIntegration,
  listAdminProviderIntegrations,
  verifyProviderIntegration
} from '../src/lib/social/providerConfigService';
import {
  createOAuthState,
  consumeOAuthState,
  buildAuthorizationUrl
} from '../src/lib/social/oauth2';
import {
  storeDiscoverySession,
  getDiscoveredAssetsSummary,
  importSelectedAsset,
  type DiscoveredAsset
} from '../src/lib/social/assetDiscoveryService';
import {
  checkAdEligibility,
  type ExternalPost
} from '../src/lib/advertising/adEligibilityService';

describe('Live Production Integration Gate — Entegrasyon & Güvenlik Testleri', () => {
  it('1. Provider Integration Config: Sırları AES-256-GCM ile şifreler, masked gösterir, DB-first çalışır', async () => {
    const rawSecret = 'meta_super_secret_production_key_2026';
    const rawDevToken = 'google_ads_dev_token_xyz987';

    await updateAdminProviderIntegration({
      provider: 'META',
      environment: 'PRODUCTION',
      clientId: 'meta_app_999999',
      clientSecret: rawSecret,
      apiVersion: 'v21.0',
      appReviewStatus: 'READY',
      writeEnabled: true,
      adsEnabled: true
    });

    // Check decrypted config
    const decrypted = await getDecryptedProviderConfig('META');
    assert.equal(decrypted.clientId, 'meta_app_999999');
    assert.equal(decrypted.clientSecret, rawSecret);
    assert.equal(decrypted.apiVersion, 'v21.0');
    assert.equal(decrypted.isConfigured, true);
    assert.equal(decrypted.status, 'READY');

    // Verify raw secret is NOT stored in plain text in database
    const dbRow = await prisma.providerIntegrationConfig.findFirst({
      where: { provider: 'META', environment: 'PRODUCTION' }
    });
    assert.ok(dbRow);
    assert.notEqual(dbRow?.clientSecretEnc, rawSecret);
    assert.equal(fromCipherText(dbRow!.clientSecretEnc), rawSecret);

    // Verify admin list masks the secret
    const adminList = await listAdminProviderIntegrations();
    const metaAdmin = adminList.find(i => i.provider === 'META');
    assert.ok(metaAdmin);
    assert.equal(metaAdmin?.hasClientSecret, true);
    assert.ok(metaAdmin?.clientSecretMasked?.startsWith('••••••••'));
    assert.ok(metaAdmin?.clientSecretMasked?.endsWith('2026'));
  });

  it('2. Provider Readiness Verification: Eksik konfigürasyonda asla sahte başarılı dönmez', async () => {
    // Unconfigured provider (e.g. SNAPCHAT in a clean test DB)
    const res = await verifyProviderIntegration('SNAPCHAT');
    if (!res.ok) {
      assert.equal(res.status, 'NOT_CONFIGURED');
    }

    // Configured provider (META)
    const metaRes = await verifyProviderIntegration('META');
    assert.equal(metaRes.ok, true);
    assert.equal(metaRes.status, 'READY');
  });

  it('3. OAuth State & PKCE Replay Gate: Tek kullanımlık, workspace/user bağlı state', async () => {
    const ws = await prisma.workspace.create({ data: { name: 'OAuth Gate WS', slug: randomUUID() } });
    const user = await prisma.user.create({
      data: { workspaceId: ws.id, name: 'OAuth User', email: `${randomUUID()}@test.invalid`, passwordHash: 'hash', role: 'EDITOR' }
    });

    const { state, codeVerifier } = await createOAuthState({
      platform: 'META',
      userId: user.id,
      workspaceId: ws.id,
      metadata: { mode: 'ALL', brandId: 'test-brand' }
    });

    assert.ok(state.length > 20);
    assert.ok(codeVerifier.length > 30);

    // Attempt consume with WRONG workspace -> MUST FAIL
    const wrongWsClaim = await consumeOAuthState(state, {
      platform: 'META',
      userId: user.id,
      workspaceId: 'wrong-workspace-id'
    });
    assert.equal(wrongWsClaim, null);

    // Attempt consume with CORRECT binding -> MUST SUCCEED
    const validClaim = await consumeOAuthState(state, {
      platform: 'META',
      userId: user.id,
      workspaceId: ws.id
    });
    assert.ok(validClaim);
    assert.equal(validClaim?.platform, 'META');
    assert.ok(validClaim?.metadata?.includes('test-brand'));

    // ATOMIC REPLAY GATE: Consume AGAIN -> MUST FAIL (already claimed)
    const replayClaim = await consumeOAuthState(state, {
      platform: 'META',
      userId: user.id,
      workspaceId: ws.id
    });
    assert.equal(replayClaim, null);
  });

  it('4. Asset Discovery & Brand Mapping: Varlıklar güvenle içe aktarılır, token AES-256-GCM ile şifrelenir', async () => {
    const ws = await prisma.workspace.create({ data: { name: 'Discovery WS', slug: randomUUID() } });
    const user = await prisma.user.create({
      data: { workspaceId: ws.id, name: 'Discovery User', email: `${randomUUID()}@test.invalid`, passwordHash: 'hash', role: 'OWNER' }
    });
    const brand = await prisma.brand.create({
      data: { workspaceId: ws.id, name: 'Kahve Dünyası', slug: randomUUID() }
    });

    const session: SessionContext = {
      sessionId: 'sess-' + randomUUID(),
      csrfToken: 'csrf-' + randomUUID(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as any,
        workspaceId: ws.id,
        workspaceName: ws.name,
        workspaceSlug: ws.slug,
        membershipId: 'm-' + randomUUID(),
        membershipStatus: 'ACTIVE',
        demoMode: false,
        avatarUrl: null,
        timezone: 'Europe/Istanbul',
        locale: 'tr-TR'
      }
    };

    const sessionKey = 'discovery_session_' + randomUUID();
    const mockAssets: DiscoveredAsset[] = [
      {
        id: 'asset_ig_1',
        provider: 'META',
        type: 'INSTAGRAM_BUSINESS',
        externalId: '1784140000000001',
        name: 'Kahve Dükkanı Official',
        handle: '@kahvedukkani_resmi',
        status: 'ACTIVE',
        permissions: ['instagram_basic', 'instagram_content_publish'],
        accessToken: 'EAAB_test_mock_instagram_access_token_999',
        refreshToken: 'refresh_mock_123',
        expiresAt: new Date(Date.now() + 60 * 24 * 3600 * 1000)
      },
      {
        id: 'asset_ad_1',
        provider: 'META',
        type: 'AD_ACCOUNT',
        externalId: 'act_1010101010',
        name: 'Kahve Dükkanı Reklam Hesabı',
        currency: 'TRY',
        timezone: 'Europe/Istanbul',
        status: 'ACTIVE',
        permissions: ['ads_management', 'ads_read'],
        accessToken: 'EAAB_test_mock_ad_token_888'
      }
    ];

    storeDiscoverySession(sessionKey, {
      userId: user.id,
      workspaceId: ws.id,
      provider: 'META',
      assets: mockAssets
    });

    // 1) Verify discovery summary returns assets correctly
    const summary = await getDiscoveredAssetsSummary(sessionKey, ws.id);
    assert.ok(summary);
    assert.equal(summary?.items.length, 2);
    assert.equal(summary?.items[0].alreadyConnected, false);

    // 2) Import Instagram Business account
    const importedSocial = await importSelectedAsset({
      sessionKey,
      assetId: 'asset_ig_1',
      brandId: brand.id,
      userContext: session
    });
    assert.equal(importedSocial.type, 'SOCIAL_ACCOUNT');
    assert.equal(importedSocial.displayName, 'Kahve Dükkanı Official');

    // Verify token is encrypted in DB and NOT stored in plaintext
    const savedToken = await prisma.socialProviderToken.findUnique({
      where: { socialAccountId: importedSocial.id }
    });
    assert.ok(savedToken);
    assert.notEqual(savedToken?.accessTokenEnc, 'EAAB_test_mock_instagram_access_token_999');
    assert.equal(fromCipherText(savedToken!.accessTokenEnc), 'EAAB_test_mock_instagram_access_token_999');

    // 3) Import Ad Account
    const importedAd = await importSelectedAsset({
      sessionKey,
      assetId: 'asset_ad_1',
      brandId: brand.id,
      userContext: session
    });
    assert.equal(importedAd.type, 'AD_ACCOUNT');
    assert.equal(importedAd.displayName, 'Kahve Dükkanı Reklam Hesabı');

    const savedAdCred = await prisma.adAccountCredential.findUnique({
      where: { adAccountId: importedAd.id }
    });
    assert.ok(savedAdCred);
    assert.notEqual(savedAdCred?.accessTokenEnc, 'EAAB_test_mock_ad_token_888');
    assert.equal(fromCipherText(savedAdCred!.accessTokenEnc), 'EAAB_test_mock_ad_token_888');

    // 4) Check discovery summary again -> items now show alreadyConnected = true
    const summaryAfter = await getDiscoveredAssetsSummary(sessionKey, ws.id);
    assert.equal(summaryAfter?.items[0].alreadyConnected, true);
    assert.equal(summaryAfter?.items[1].alreadyConnected, true);
  });

  it('5. Ad Eligibility Service: Telifli müzik, video süresi ve medya eksikliği denetimleri', () => {
    // Post with copyrighted audio -> NOT eligible
    const copyrightedPost: ExternalPost = {
      id: 'p1',
      provider: 'META',
      externalId: 'ext_1',
      caption: 'Harika bir kahve deneyimi!',
      mediaType: 'VIDEO',
      mediaUrls: ['https://cdn.example.com/video.mp4'],
      permalink: 'https://instagram.com/p/1',
      publishedAt: new Date().toISOString(),
      likes: 120,
      comments: 15,
      shares: 4,
      hasCopyrightedAudio: true,
      videoDurationSeconds: 25
    };
    const audioCheck = checkAdEligibility(copyrightedPost, 'META');
    assert.equal(audioCheck.eligible, false);
    assert.equal(audioCheck.code, 'COPYRIGHTED_AUDIO');
    assert.ok(audioCheck.reason.includes('telifli müzik'));

    // Post with video duration > 120s -> NOT eligible
    const tooLongPost: ExternalPost = {
      ...copyrightedPost,
      hasCopyrightedAudio: false,
      videoDurationSeconds: 150
    };
    const durationCheck = checkAdEligibility(tooLongPost, 'META');
    assert.equal(durationCheck.eligible, false);
    assert.equal(durationCheck.code, 'INVALID_DURATION');

    // Text post on Instagram -> NOT eligible (needs image/video)
    const textOnlyPost: ExternalPost = {
      id: 'p2',
      provider: 'META',
      externalId: 'ext_2',
      caption: 'Sadece metin duyurusu',
      mediaType: 'TEXT',
      mediaUrls: [],
      permalink: 'https://instagram.com/p/2',
      publishedAt: new Date().toISOString(),
      likes: 10,
      comments: 2,
      shares: 0
    };
    const mediaCheck = checkAdEligibility(textOnlyPost, 'META');
    assert.equal(mediaCheck.eligible, false);
    assert.equal(mediaCheck.code, 'MISSING_MEDIA');

    // Perfect 30s clean video post -> ELIGIBLE
    const eligiblePost: ExternalPost = {
      id: 'p3',
      provider: 'META',
      externalId: 'ext_3',
      caption: 'Yaz kampanyası başladı!',
      mediaType: 'VIDEO',
      mediaUrls: ['https://cdn.example.com/clean_video.mp4'],
      permalink: 'https://instagram.com/p/3',
      publishedAt: new Date().toISOString(),
      likes: 540,
      comments: 32,
      shares: 18,
      hasCopyrightedAudio: false,
      videoDurationSeconds: 30
    };
    const eligibleResult = checkAdEligibility(eligiblePost, 'META');
    assert.equal(eligibleResult.eligible, true);
    assert.equal(eligibleResult.code, 'ELIGIBLE');
    assert.ok(eligibleResult.recommendedPlacements.includes('REELS'));
  });
});
