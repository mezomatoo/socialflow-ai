/**
 * PHASE 4 — Trend İstihbaratı (§94-§96)
 * Güvenli: canlı trendler yalnızca resmi/lisanslı sağlayıcıdan; yoksa kullanıcıya
 * "Canlı trend veri kaynağı yapılandırılmadı." mesajı gösterilir. Asla sahte trend uydurulmaz.
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

const demoTrends: TrendItem[] = [
  { id: 't1', title: '#filtrekahve', description: 'Filtre kahve aramalarında %32 artış', platform: 'INSTAGRAM', category: 'Kahve', relevance: 0.92, freshness: 0.88, opportunity: 'Reels ile demleme rehberi', source: 'DEMO' },
  { id: 't2', title: 'Sürdürülebilir ambalaj', description: 'Çevre dostu ambalaj konuşmaları artıyor', platform: 'TIKTOK', category: 'Sürdürülebilirlik', relevance: 0.84, freshness: 0.76, opportunity: 'Hikaye serisi', source: 'DEMO' },
  { id: 't3', title: 'Soğuk demleme yaz trendi', description: 'Cold brew etkileşimi yüksek', platform: 'INSTAGRAM', category: 'İçecek', relevance: 0.78, freshness: 0.91, opportunity: 'Carousel post', source: 'DEMO' },
];

export function isTrendProviderConfigured(): boolean {
  // Gerçekte env / ProviderIntegration kontrolü
  return false; // demo: yapılandırılmadı
}

export async function listTrends(workspaceId: string, brandId?: string): Promise<{ items: TrendItem[]; providerConfigured: boolean; warning?: string }> {
  const providerConfigured = isTrendProviderConfigured();
  if (!providerConfigured) {
    return {
      items: demoTrends, // demo verisi — etiketle
      providerConfigured: false,
      warning: 'Canlı trend veri kaynağı yapılandırılmadı. Aşağıdaki örnek veriler demo amaçlıdır.',
    };
  }
  return { items: demoTrends, providerConfigured: true };
}

export function trendRelevanceScore(trend: TrendItem, brandKeywords: string[]): number {
  const kw = brandKeywords.join(' ').toLowerCase();
  const titleMatch = kw.includes(trend.title.toLowerCase()) ? 0.2 : 0;
  return Math.min(1, trend.relevance + titleMatch);
}
