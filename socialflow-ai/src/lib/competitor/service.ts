/**
 * PHASE 4 — Rakip İstihbaratı (§97-§99)
 * Yalnızca resmi / izinli / lisanslı veri. Güvensiz scraping yok.
 */

export interface CompetitorProfile {
  id: string;
  name: string;
  handle?: string | null;
  platform?: string | null;
  website?: string | null;
}

export interface CompetitorInsight {
  id: string;
  competitorId: string;
  type: 'GAP' | 'STRENGTH' | 'OPPORTUNITY';
  title: string;
  description?: string | null;
}

const mockCompetitors: CompetitorProfile[] = [
  { id: 'comp-1', name: 'Rakip Kahve', handle: '@rakipkahve', platform: 'INSTAGRAM', website: 'https://rakip.example.com' },
  { id: 'comp-2', name: 'Premium Roasters', handle: '@premiumroasters', platform: 'TIKTOK' },
];

const mockInsights: CompetitorInsight[] = [
  { id: 'ins-1', competitorId: 'comp-1', type: 'GAP', title: 'Eğitici içerik boşluğu', description: 'Rakip eğitici Reels paylaşmıyor — fırsat.' },
  { id: 'ins-2', competitorId: 'comp-1', type: 'OPPORTUNITY', title: 'Sabah rutini serisi', description: 'Hedef kitlenin sabah rutini ilgisi yüksek.' },
];

export async function listCompetitors(workspaceId: string): Promise<CompetitorProfile[]> {
  return mockCompetitors;
}

export async function listInsights(workspaceId: string, competitorId?: string): Promise<CompetitorInsight[]> {
  if (competitorId) return mockInsights.filter((i) => i.competitorId === competitorId);
  return mockInsights;
}

export function contentGapAnalysis(input: { existingTopics: string[]; competitorTopics: string[]; trendTopics: string[] }): { opportunities: string[] } {
  const all = new Set([...input.competitorTopics, ...input.trendTopics]);
  const missing = [...all].filter((t) => !input.existingTopics.includes(t));
  return { opportunities: missing.slice(0, 5) };
}

export const COMPETITOR_WARNING = 'Rakip verileri yalnızca resmi API / lisanslı sağlayıcı veya sizin eklediğiniz verilerle beslenir. İzinsiz kazıma yapılmaz.';
