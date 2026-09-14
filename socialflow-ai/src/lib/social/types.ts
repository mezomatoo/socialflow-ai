import type { ContentType, PlatformCode } from '../platforms/platforms';

export type { ContentType, PlatformCode };
import type { PlatformRuleView } from '../rules/ruleEngine';
import type { MediaVariant } from '../media/types';

/**
 * Sosyal sağlayıcı sözleşmeleri.
 * Her platform bu tipleri kullanır; böylece platform mantığı uygulamanın
 * geri kalanına SIZMAZ.
 */

export type PublishKind = 'POST' | 'STORY' | 'VIDEO' | 'REEL' | 'SHORTS' | 'PIN' | 'LOCAL_POST';

export interface AccountProfile {
  externalId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  accountType?: string;
  scopes?: string[];
  followers?: number | null;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string;
  scope?: string;
  expiresIn?: number | null; // saniye
  refreshExpiresIn?: number | null;
}

export interface MediaValidationResult {
  ok: boolean;
  issues: { level: 'ERROR' | 'WARNING' | 'INFO'; code: string; message: string }[];
}

export interface CaptionValidationResult {
  ok: boolean;
  length: number;
  limit: number;
  issues: { level: 'ERROR' | 'WARNING' | 'INFO'; code: string; message: string }[];
}

export interface PublishPayload {
  /** PlatformContent.id */
  platformContentId: string;
  contentId: string;
  workspaceId: string;
  platform: PlatformCode;
  contentType: ContentType;
  rule: PlatformRuleView;
  account: {
    id: string;
    externalId: string | null;
    handle: string;
    displayName: string;
    accountType: string;
  };
  caption: string;
  title?: string | null;
  hashtags: string[];
  firstComment?: string | null;
  cta?: string | null;
  linkUrl?: string | null;
  location?: string | null;
  altText?: string | null;
  scheduledFor?: Date | null;
  /** Yayınlanacak medyanın erişilebilir URL'i (sağlayıcının çekebileceği). */
  media: {
    kind: 'IMAGE' | 'VIDEO';
    url: string;
    storageKey: string;
    mimeType: string;
    bytes: number;
    width: number | null;
    height: number | null;
    durationMs?: number | null;
    variant?: MediaVariant | null;
  }[];
  /** Tekrar denemelerde çift gönderimi engelleyen anahtar. */
  idempotencyKey: string;
  demoMode: boolean;
  /** Hashtag yerleşimi (INLINE | FIRST_COMMENT | SEPARATE). */
  hashtagPlacement?: 'INLINE' | 'FIRST_COMMENT' | 'SEPARATE';
  /**
   * Şifresi çözülmüş erişim token'ı — YALNIZCA sunucu tarafında, yayın işi
   * çalışırken eklenir. Asla loglanmaz, asla istemciye dönmez.
   */
  accessToken?: string;
}

export interface PublishResult {
  ok: boolean;
  demoMode: boolean;
  externalPostId?: string | null;
  permalink?: string | null;
  /** Sağlayıcının ham hata kodu (log için; kullanıcıya gösterilmez). */
  providerCode?: string | null;
  providerMessage?: string | null;
  httpStatus?: number | null;
  /** Kullanıcıya gösterilecek Türkçe mesaj. */
  friendlyMessage?: string | null;
  /** Önerilen aksiyon (ör. "Hesabı Yeniden Bağla"). */
  action?: { label: string; route: string } | null;
  /** Tekrar denenebilir mi? (429/5xx → true, 401/403 → genelde false) */
  retryable?: boolean;
  /** Sağlayıcı tarafından zamanlandıysa */
  providerScheduled?: boolean;
  raw?: unknown;
}

export interface PostStatusResult {
  status: 'PUBLISHED' | 'PENDING' | 'PROCESSING' | 'FAILED' | 'UNKNOWN';
  externalPostId?: string | null;
  permalink?: string | null;
  message?: string | null;
}

export interface AnalyticsResult {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  videoViews: number;
  engagementRate: number;
  followerDelta: number;
  fetchedAt: Date;
  source: 'API';
}

export interface MediaValidationInput {
  kind: 'IMAGE' | 'VIDEO';
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs?: number | null;
}

/**
 * SocialProvider — tüm platform adaptörlerinin uyguladığı arayüz.
 */
export interface SocialProvider {
  readonly platform: PlatformCode;
  readonly label: string;
  readonly apiVersion: string;

  /** OAuth başlatma URL'i (state + PKCE ile). */
  getAuthorizationUrl(params: {
    state: string;
    redirectUri: string;
    codeVerifier?: string;
    scopes?: string[];
  }): string;

  /** Yetkilendirme kodunu token'a çevirir. */
  exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<TokenSet>;

  /** Süresi dolan token'ı yeniler. */
  refreshToken(token: { accessToken: string; refreshToken?: string | null }): Promise<TokenSet>;

  /** Bağlı hesap/sayfa profillerini getirir. */
  fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]>;

  /** Token hâlâ geçerli mi? */
  validateToken(accessToken: string): Promise<{ valid: boolean; message?: string }>;

  /** Kural motoruna ek olarak sağlayıcıya özgü medya doğrulaması. */
  validateMedia(input: MediaValidationInput, rule: PlatformRuleView): MediaValidationResult;

  /** Açıklama doğrulaması. */
  validateCaption(caption: string, rule: PlatformRuleView): CaptionValidationResult;

  publishPost(payload: PublishPayload): Promise<PublishResult>;
  publishStory(payload: PublishPayload): Promise<PublishResult>;
  publishVideo(payload: PublishPayload): Promise<PublishResult>;
  schedulePost(payload: PublishPayload): Promise<PublishResult>;
  deletePost(externalPostId: string, accessToken: string): Promise<{ ok: boolean; message?: string }>;
  getPostStatus(externalPostId: string, accessToken: string): Promise<PostStatusResult>;
  getAnalytics(externalPostId: string, accessToken: string): Promise<AnalyticsResult | null>;

  /** Bu sağlayıcı içerik türünü destekliyor mu? */
  supports(contentType: ContentType): boolean;
}
