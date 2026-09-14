/**
 * PHASE 4 — Özellik bayrakları (§137)
 * ---------------------------------------------------------------------------
 * Yeni AI/otomasyon yetenekleri varsayılan olarak KAPALIdır (güvenlik). Yalnızca
 * inşa etmekte olduğumuz Brand Kit çekirdeği (brandKitAdvanced, brandLock)
 * varsayılan AÇIKtır. Bayraklar `FF_<SCREAMING_SNAKE>` ortam değişkeniyle
 * ("true"/"false") geçersiz kılınabilir. Workspace-bazlı kalıcı bayraklar, admin
 * AI kullanım ekranıyla (ileriki adım) AppSettings üzerinden yönetilecektir; bu
 * katman şimdilik env + varsayılan okur ve TEK doğruluk kaynağıdır.
 */

export const FEATURE_FLAGS = [
  'brandKitAdvanced',
  'brandLock',
  'aiImageGeneration',
  'aiImageEditing',
  'generativeExpand',
  'smartCreativeResize',
  'aiVideoRepurposing',
  'aiContentPlanner',
  'aiCampaignBuilder',
  'predictivePerformance',
  'trendIntelligence',
  'competitorIntelligence',
  'automationEngine',
  'semanticSearch'
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** Varsayılan durumlar: güvenlik için çoğu AI/otomasyon bayrağı KAPALI. */
export const FEATURE_FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  brandKitAdvanced: true,
  brandLock: true,
  aiImageGeneration: false,
  aiImageEditing: false,
  generativeExpand: false,
  smartCreativeResize: false,
  aiVideoRepurposing: false,
  aiContentPlanner: false,
  aiCampaignBuilder: false,
  predictivePerformance: false,
  trendIntelligence: false,
  competitorIntelligence: false,
  automationEngine: false,
  semanticSearch: false
};

export const FEATURE_FLAG_LABELS: Record<FeatureFlag, string> = {
  brandKitAdvanced: 'Gelişmiş Marka Kiti',
  brandLock: 'Marka Kilidi',
  aiImageGeneration: 'AI Görsel Üretme',
  aiImageEditing: 'AI Görsel Düzenleme',
  generativeExpand: 'Üretken Genişletme',
  smartCreativeResize: 'Akıllı Kreatif Yeniden Boyutlandırma',
  aiVideoRepurposing: 'AI Video Dönüştürme',
  aiContentPlanner: 'AI İçerik Planlayıcı',
  aiCampaignBuilder: 'AI Kampanya Oluşturucu',
  predictivePerformance: 'Öngörüsel Performans',
  trendIntelligence: 'Trend İstihbaratı',
  competitorIntelligence: 'Rakip İstihbaratı',
  automationEngine: 'Otomasyon Motoru',
  semanticSearch: 'Anlamsal Arama'
};

function envKey(flag: FeatureFlag): string {
  return 'FF_' + flag.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/** Bir özellik bayrağı etkin mi? (env override > varsayılan) */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const raw = process.env[envKey(flag)];
  if (raw === undefined || raw === '') return FEATURE_FLAG_DEFAULTS[flag];
  return raw === 'true' || raw === '1';
}

/** Tüm bayrakların etkin durumunu döner (admin/ayar ekranları için). */
export function featureFlagState(): Record<FeatureFlag, boolean> {
  return FEATURE_FLAGS.reduce(
    (acc, f) => {
      acc[f] = isFeatureEnabled(f);
      return acc;
    },
    {} as Record<FeatureFlag, boolean>
  );
}
