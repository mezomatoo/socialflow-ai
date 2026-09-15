/** Implemented engagement capabilities, NOT an assertion of a provider's theoretical API surface.
 * Fail closed until that adapter, account permissions and app review have been verified.
 * Publishing capability and connection status remain independent.
 */
export interface EngagementCapabilities {
  supportsComments: boolean; supportsCommentReply: boolean; supportsDM: boolean;
  supportsMentions: boolean; supportsReviews: boolean; supportsMessageHistory: boolean;
  supportsModeration: boolean; supportsWebhooks: boolean; supportsRealtimeEvents: boolean;
  limitation: string;
}
export function unavailableEngagement(): EngagementCapabilities {
  return {
    supportsComments: false, supportsCommentReply: false, supportsDM: false,
    supportsMentions: false, supportsReviews: false, supportsMessageHistory: false,
    supportsModeration: false, supportsWebhooks: false, supportsRealtimeEvents: false,
    limitation: 'API KISITLAMASI — Bu hesap için gelen kutusu bağlantısı henüz doğrulanmadı. Yanıtı platformun resmî uygulamasından yönetin. Elle eklenen kayıtlar otomatik senkronize edilmez.'
  };
}
