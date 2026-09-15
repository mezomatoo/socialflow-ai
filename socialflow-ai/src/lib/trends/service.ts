/**
 * PHASE 4 — Trend İstihbaratı (§94-§96) — DÜRÜST MOD (Faz 7 §13/§90)
 * ---------------------------------------------------------------------------
 * Canlı trendler YALNIZCA resmî/lisanslı bir sağlayıcı yapılandırıldığında
 * gösterilir. Bu kurulumda böyle bir sağlayıcı HENÜZ YOKTUR; bu yüzden servis
 * boş liste + dürüst uyarı döner. SAHTE/DEMO TREND ÜRETİLMEZ (§13): sağlayıcı
 * yokken veri yok demek, uydurma veri göstermekten doğrudur.
 *
 * Sağlayıcı entegre edildiğinde `isTrendProviderConfigured()` gerçek env /
 * ProviderIntegration kontrolüne bağlanır ve `listTrends` o sağlayıcıdan okur.
 */

export interface TrendItem {
  id: string;
  title: string;
  description?: string | null;
  platform?: string | null;
  category?: string | null;
  relevance: number; // 0-1
  freshness: number;
  opportunity?: string | null;
  source: string;
}

export interface TrendListResult {
  items: TrendItem[];
  providerConfigured: boolean;
  warning?: string;
}

export const TREND_PROVIDER_WARNING =
  'Canlı trend veri kaynağı yapılandırılmadı. Trendler yalnızca resmî/lisanslı bir sağlayıcı bağlandığında gösterilir; sahte trend verisi üretilmez.';

export function isTrendProviderConfigured(): boolean {
  // Gerçek sağlayıcı entegrasyonu henüz yoktur (§90: kaynaksız trend = trend yok).
  return false;
}

export async function listTrends(_workspaceId: string, _brandId?: string): Promise<TrendListResult> {
  const providerConfigured = isTrendProviderConfigured();
  if (!providerConfigured) {
    return { items: [], providerConfigured: false, warning: TREND_PROVIDER_WARNING };
  }
  // Ulaşılamaz dal: gerçek sağlayıcı bağlandığında burada o sağlayıcıdan okunur.
  return { items: [], providerConfigured: true };
}

/** Saf skor yardımcısı — gerçek sağlayıcı verisi geldiğinde sıralama için kullanılır. */
export function trendRelevanceScore(trend: TrendItem, brandKeywords: string[]): number {
  const kw = brandKeywords.join(' ').toLowerCase();
  const titleMatch = kw.includes(trend.title.toLowerCase()) ? 0.2 : 0;
  return Math.min(1, trend.relevance + titleMatch);
}
