/** Paid-media contracts are deliberately separate from SocialProvider (organic publishing). */
export const AD_CAPABILITIES = [
  'supportsAdAccountRead', 'supportsCampaignRead', 'supportsCampaignCreate', 'supportsCampaignUpdate',
  'supportsCampaignPause', 'supportsCampaignResume', 'supportsCreativeCreate', 'supportsExistingPostPromotion',
  'supportsDarkAds', 'supportsAudienceCreate', 'supportsCustomAudience', 'supportsLookalikeAudience',
  'supportsCatalogAds', 'supportsLeadAds', 'supportsVideoAds', 'supportsStoryAds', 'supportsReelsAds',
  'supportsSearchAds', 'supportsDisplayAds', 'supportsConversionUpload', 'supportsPixel',
  'supportsServerSideConversions', 'supportsBudgetEdit', 'supportsBidEdit', 'supportsPlacements',
  'supportsReporting', 'supportsRevenueMetrics'
] as const;
export type AdCapability = typeof AD_CAPABILITIES[number];
export type AdCapabilities = Readonly<Record<AdCapability, boolean>>;
export function noAdCapabilities(): AdCapabilities {
  return Object.freeze(Object.fromEntries(AD_CAPABILITIES.map(key => [key, false])) as Record<AdCapability, boolean>);
}
export type AdProviderInfo = {
  code: string; name: string; placementsLabel: string; color: string;
  implementation: 'NOT_IMPLEMENTED' | 'READ_ONLY' | 'READ_WRITE';
  apiVersion: string | null;
};
export interface AdvertisingAccessContext {
  workspaceId: string;
  /** Decrypted only on the server at call time; never serialize to API responses, jobs or logs. */
  accessToken: string;
}
export type ProviderAdAccount = {
  providerAccountId: string; name: string; currency: string; timezone: string;
  providerTimezone: string | null; status: string; permissions: string[];
};
export type ProviderPage<T> = { items: T[]; nextCursor: string | null };
export type ProviderCampaignRead = {
  providerCampaignId: string; name: string; status: string; objective: string | null;
};
export type MetricAvailability = 'AVAILABLE' | 'NOT_SYNCED' | 'NOT_PROVIDED';
/** Zero is a measured value. Missing provider data is null, never an inferred zero. */
export type AdMetric = { value: number | null; availability: MetricAvailability };
export function unavailableMetric(availability: Exclude<MetricAvailability, 'AVAILABLE'> = 'NOT_SYNCED'): AdMetric {
  return { value: null, availability };
}
export function measuredMetric(value: number): AdMetric {
  if (!Number.isFinite(value)) throw new Error('Ölçüm geçerli bir sayı olmalıdır.');
  return { value, availability: 'AVAILABLE' };
}
export interface AdvertisingProviderAdapter {
  readonly info: AdProviderInfo;
  getCapabilities(): AdCapabilities;
  readAdAccounts(context: AdvertisingAccessContext, cursor?: string): Promise<ProviderPage<ProviderAdAccount>>;
  readCampaigns(context: AdvertisingAccessContext, providerAccountId: string, cursor?: string): Promise<ProviderPage<ProviderCampaignRead>>;
  // Financial writes intentionally absent in Stage A. A future explicit command contract must carry
  // approval, idempotency and immutable submission versions; do not reuse organic publishPost.
}
export class AdvertisingError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export const AD_ACCOUNT_STATUSES: Record<string, string> = {
  UNVERIFIED: 'Doğrulanmadı', CONNECTED: 'Bağlı', REAUTH_REQUIRED: 'Yeniden Yetkilendirme Gerekli', DISCONNECTED: 'Bağlı Değil'
};
export const AD_REVIEW_STATUSES = {
  DRAFT: 'Taslak', VALIDATING: 'Kontrol Ediliyor', READY: 'Hazır', SUBMITTED: 'Gönderildi',
  IN_REVIEW: 'Platform İncelemesinde', APPROVED: 'Onaylandı', ACTIVE: 'Aktif', PAUSED: 'Duraklatıldı',
  REJECTED: 'Reddedildi', COMPLETED: 'Tamamlandı', ERROR: 'Hata'
} as const;
