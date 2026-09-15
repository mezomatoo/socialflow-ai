/**
 * Sosyal platform ve içerik türü tanımları.
 * NOT: Karakter limitleri, görsel ölçüleri vb. BURADA DEĞİL, veritabanındaki
 * `PlatformRule` kayıtlarında tutulur (bkz. src/lib/platforms/builtinRules.ts).
 * Bu dosya yalnızca kimlik + sunum (marka rengi, ikon, Türkçe etiket) içerir.
 */

export const PLATFORMS = [
  'INSTAGRAM',
  'FACEBOOK',
  'X',
  'LINKEDIN',
  'TIKTOK',
  'YOUTUBE',
  'THREADS',
  'PINTEREST',
  'GOOGLE_BUSINESS'
] as const;

export type PlatformCode = (typeof PLATFORMS)[number];

export const CONTENT_TYPES = [
  'FEED',
  'STORY',
  'REEL',
  'SHORTS',
  'POST',
  'VIDEO',
  'PIN',
  'LOCAL_POST',
  'PROFILE_POST'
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_STYLES = [
  'CORPORATE',
  'PROFESSIONAL',
  'FRIENDLY',
  'PREMIUM',
  'MINIMAL',
  'FUN',
  'SALES',
  'INFORMATIVE',
  'STORYTELLING',
  'LAUNCH',
  'CAMPAIGN',
  'ANNOUNCEMENT'
] as const;

export type ContentStyle = (typeof CONTENT_STYLES)[number];

export const CONTENT_STATUS = [
  // PHASE 1 çekirdek durumları
  'DRAFT',
  'PROCESSING',
  'READY',
  'ARCHIVED',
  // İleri fazlar için yapısal olarak hazır tutulan yayın durumları
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'PARTIALLY_PUBLISHED',
  'FAILED',
  'APPROVAL_PENDING'
] as const;
export type ContentStatus = (typeof CONTENT_STATUS)[number];

export const PUBLISH_STATUS = [
  'DRAFT',
  'PROCESSING',
  'READY',
  'ARCHIVED',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
  'APPROVAL_PENDING',
  'PARTIAL'
] as const;
export type PublishStatus = (typeof PUBLISH_STATUS)[number];

export const CONNECTION_STATUS = ['ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR', 'NEEDS_REAUTH'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUS)[number];

export const INTEGRATION_STATUS = ['CONNECTED', 'NOT_CONFIGURED', 'NEEDS_REAUTH', 'ERROR'] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUS)[number];

export const ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'CREATOR', 'APPROVER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

/** İçeriğin kaynağı (§28). Phase 1 ağırlıklı olarak MANUAL ve AI_ASSISTED kullanır. */
export const CONTENT_ORIGINS = [
  'MANUAL',
  'AI_ASSISTED',
  'AI_GENERATED',
  'IMPORTED',
  'REPURPOSED'
] as const;
export type ContentOrigin = (typeof CONTENT_ORIGINS)[number];

export const CONTENT_ORIGIN_LABELS: Record<ContentOrigin, string> = {
  MANUAL: 'Elle oluşturuldu',
  AI_ASSISTED: 'AI destekli',
  AI_GENERATED: 'AI ile üretildi',
  IMPORTED: 'İçe aktarıldı',
  REPURPOSED: 'Yeniden kullanıldı'
};

/** Medya işleme durumları (§48) — Türkçe etiketlerle. */
export const MEDIA_STATUS = ['UPLOADED', 'PROCESSING', 'READY', 'FAILED'] as const;
export type MediaStatus = (typeof MEDIA_STATUS)[number];

export const MEDIA_STATUS_LABELS: Record<MediaStatus, string> = {
  UPLOADED: 'Yüklendi',
  PROCESSING: 'İşleniyor',
  READY: 'Hazır',
  FAILED: 'Başarısız'
};

/** Kuyruk işleri (§74) — ağır işler istek/yanıt döngüsünden ayrılır. */
export const QUEUE_JOB_TYPES = [
  'ProcessMediaJob',
  'GenerateMediaVariantJob',
  'GeneratePlatformCaptionJob',
  // İleri fazlar için hazır
  'PublishContentJob',
  'SyncAnalyticsJob',
  'TokenRefreshJob'
] as const;
export type QueueJobType = (typeof QUEUE_JOB_TYPES)[number];

export const HASHTAG_GROUPS = ['GENERAL', 'NICHE', 'BRAND', 'CAMPAIGN', 'LOCATION', 'TREND'] as const;
export type HashtagGroup = (typeof HASHTAG_GROUPS)[number];

export const JOB_TYPES = [
  'PublishContentJob',
  'MediaProcessingJob',
  'AnalyticsSyncJob',
  'TokenRefreshJob'
] as const;
export type JobType = (typeof JOB_TYPES)[number];

// ---------------------------------------------------------------------------
// Sunum meta verisi
// ---------------------------------------------------------------------------

export interface PlatformMeta {
  code: PlatformCode;
  name: string; // Türkçe görünen ad
  shortName: string;
  brandColor: string;
  glyph: string; // ikon içinde gösterilecek kısa harf(ler)
  officialApi: string;
  docsUrl: string;
  envKeyPrefix: string;
  supportsOAuth: boolean;
  /** Bu platformun desteklediği içerik türleri (kural motoru ile doğrulanır). */
  contentTypes: ContentType[];
  /** Kullanıcı arayüzünde görünen Türkçe içerik türü etiketleri. */
  contentTypeLabels: Partial<Record<ContentType, string>>;
  note?: string;
}

export const PLATFORM_META: Record<PlatformCode, PlatformMeta> = {
  INSTAGRAM: {
    code: 'INSTAGRAM',
    name: 'Instagram',
    shortName: 'IG',
    brandColor: '#E1306C',
    glyph: 'IG',
    officialApi: 'Instagram Graph API',
    docsUrl: 'https://developers.facebook.com/docs/instagram-api',
    envKeyPrefix: 'INSTAGRAM_',
    supportsOAuth: true,
    contentTypes: ['FEED', 'STORY', 'REEL'],
    contentTypeLabels: { FEED: 'Gönderi', STORY: 'Hikaye', REEL: 'Reels' }
  },
  FACEBOOK: {
    code: 'FACEBOOK',
    name: 'Facebook',
    shortName: 'FB',
    brandColor: '#1877F2',
    glyph: 'FB',
    officialApi: 'Facebook Graph API',
    docsUrl: 'https://developers.facebook.com/docs/graph-api',
    envKeyPrefix: 'FACEBOOK_',
    supportsOAuth: true,
    contentTypes: ['FEED', 'STORY', 'REEL'],
    contentTypeLabels: { FEED: 'Gönderi', STORY: 'Hikaye', REEL: 'Reels' }
  },
  X: {
    code: 'X',
    name: 'X',
    shortName: 'X',
    brandColor: '#0F1419',
    glyph: 'X',
    officialApi: 'X API v2',
    docsUrl: 'https://developer.x.com/en/docs/x-api',
    envKeyPrefix: 'X_',
    supportsOAuth: true,
    contentTypes: ['POST'],
    contentTypeLabels: { POST: 'Gönderi' }
  },
  LINKEDIN: {
    code: 'LINKEDIN',
    name: 'LinkedIn',
    shortName: 'IN',
    brandColor: '#0A66C2',
    glyph: 'IN',
    officialApi: 'LinkedIn Marketing / Share API',
    docsUrl: 'https://learn.microsoft.com/en-us/linkedin/',
    envKeyPrefix: 'LINKEDIN_',
    supportsOAuth: true,
    contentTypes: ['POST', 'PROFILE_POST'],
    contentTypeLabels: { POST: 'Şirket Sayfası Gönderisi' },
    note: 'Kişisel profil gönderileri için ayrı hesap bağlantısı gerekir.'
  },
  TIKTOK: {
    code: 'TIKTOK',
    name: 'TikTok',
    shortName: 'TT',
    brandColor: '#010101',
    glyph: 'TT',
    officialApi: 'TikTok Content Posting API',
    docsUrl: 'https://developers.tiktok.com/doc/content-posting-api-get-started',
    envKeyPrefix: 'TIKTOK_',
    supportsOAuth: true,
    contentTypes: ['VIDEO'],
    contentTypeLabels: { VIDEO: 'Video' }
  },
  YOUTUBE: {
    code: 'YOUTUBE',
    name: 'YouTube',
    shortName: 'YT',
    brandColor: '#FF0000',
    glyph: 'YT',
    officialApi: 'YouTube Data API v3',
    docsUrl: 'https://developers.google.com/youtube/v3',
    envKeyPrefix: 'YOUTUBE_',
    supportsOAuth: true,
    contentTypes: ['VIDEO', 'SHORTS'],
    contentTypeLabels: { VIDEO: 'Video', SHORTS: 'Shorts' }
  },
  THREADS: {
    code: 'THREADS',
    name: 'Threads',
    shortName: 'TH',
    brandColor: '#111111',
    glyph: 'TH',
    officialApi: 'Threads API',
    docsUrl: 'https://developers.facebook.com/docs/threads',
    envKeyPrefix: 'THREADS_',
    supportsOAuth: true,
    contentTypes: ['POST'],
    contentTypeLabels: { POST: 'Gönderi' }
  },
  PINTEREST: {
    code: 'PINTEREST',
    name: 'Pinterest',
    shortName: 'PI',
    brandColor: '#E60023',
    glyph: 'PI',
    officialApi: 'Pinterest API v5',
    docsUrl: 'https://developers.pinterest.com/docs/api/v5/',
    envKeyPrefix: 'PINTEREST_',
    supportsOAuth: true,
    contentTypes: ['PIN'],
    contentTypeLabels: { PIN: 'Pin' }
  },
  GOOGLE_BUSINESS: {
    code: 'GOOGLE_BUSINESS',
    name: 'Google Business Profile',
    shortName: 'GB',
    brandColor: '#4285F4',
    glyph: 'GB',
    officialApi: 'Google Business Profile Performance API',
    docsUrl: 'https://developers.google.com/my-business',
    envKeyPrefix: 'GOOGLE_',
    supportsOAuth: true,
    contentTypes: ['LOCAL_POST'],
    contentTypeLabels: { LOCAL_POST: 'İşletme Gönderisi' }
  }
};

export const PLATFORM_LIST = PLATFORMS.map((p) => PLATFORM_META[p]);

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  FEED: 'Gönderi',
  STORY: 'Hikaye',
  REEL: 'Reels',
  SHORTS: 'Shorts',
  POST: 'Gönderi',
  VIDEO: 'Video',
  PIN: 'Pin',
  LOCAL_POST: 'İşletme Gönderisi',
  PROFILE_POST: 'Kişisel Profil Gönderisi'
};

export const CONTENT_STYLE_LABELS: Record<ContentStyle, string> = {
  CORPORATE: 'Kurumsal',
  PROFESSIONAL: 'Profesyonel',
  FRIENDLY: 'Samimi',
  PREMIUM: 'Premium',
  MINIMAL: 'Minimal',
  FUN: 'Eğlenceli',
  SALES: 'Satış Odaklı',
  INFORMATIVE: 'Bilgilendirici',
  STORYTELLING: 'Hikaye Anlatımı',
  LAUNCH: 'Lansman',
  CAMPAIGN: 'Kampanya',
  ANNOUNCEMENT: 'Duyuru'
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: 'Taslak',
  PROCESSING: 'İşleniyor',
  READY: 'Hazır',
  ARCHIVED: 'Arşivlendi',
  SCHEDULED: 'Planlandı',
  PUBLISHING: 'Yayınlanıyor',
  PUBLISHED: 'Yayınlandı',
  PARTIALLY_PUBLISHED: 'Kısmen Yayınlandı',
  FAILED: 'Hata',
  APPROVAL_PENDING: 'Onay Bekliyor'
};

export const PUBLISH_STATUS_LABELS: Record<PublishStatus, string> = {
  DRAFT: 'Taslak',
  PROCESSING: 'İşleniyor',
  READY: 'Hazır',
  ARCHIVED: 'Arşivlendi',
  SCHEDULED: 'Planlandı',
  PUBLISHING: 'Yayınlanıyor',
  PUBLISHED: 'Yayınlandı',
  FAILED: 'Yayınlanamadı',
  CANCELLED: 'İptal Edildi',
  APPROVAL_PENDING: 'Onay Bekliyor',
  PARTIAL: 'Kısmen Yayınlandı'
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Sahip',
  ADMIN: 'Yönetici',
  EDITOR: 'Editör',
  CREATOR: 'İçerik Üreticisi',
  APPROVER: 'Onaylayıcı',
  VIEWER: 'Görüntüleyici'
};

export const HASHTAG_GROUP_LABELS: Record<HashtagGroup, string> = {
  GENERAL: 'Genel',
  NICHE: 'Niş',
  BRAND: 'Marka',
  CAMPAIGN: 'Kampanya',
  LOCATION: 'Lokasyon',
  TREND: 'Trend'
};

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  CONNECTED: 'Bağlı',
  NOT_CONFIGURED: 'Yapılandırılmadı',
  NEEDS_REAUTH: 'Yeniden Yetkilendirme Gerekli',
  ERROR: 'Hata'
};

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  ACTIVE: 'Bağlı',
  EXPIRED: 'Süresi Doldu',
  REVOKED: 'Bağlantı Kesildi',
  ERROR: 'Hata',
  NEEDS_REAUTH: 'Yeniden Yetkilendirme Gerekli'
};

/** "1:1" gibi oran metnini sayıya çevirir. */
export function ratioToNumber(ratio: string): number {
  const [a, b] = ratio.split(':').map(Number);
  if (!a || !b) return 1;
  return a / b;
}

export function contentKey(platform: PlatformCode | string, contentType: string): string {
  return `${platform}:${contentType}`;
}
