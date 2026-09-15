/**
 * PHASE 4 — Rakip İstihbaratı (§97-§99) — DÜRÜST MOD (Faz 7 §13/§90)
 * ---------------------------------------------------------------------------
 * Yalnızca resmî / izinli / lisanslı veri. Güvensiz scraping yok.
 * Bu kurulumda rakip veri kaynağı HENÜZ YOKTUR; servis boş liste döner.
 * SAHTE RAKİP / SAHTE İÇGÖRÜ ÜRETİLMEZ (§13) — sahte rakip dizileri kaldırıldı.
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

export const COMPETITOR_WARNING =
  'Rakip verileri yalnızca resmi API / lisanslı sağlayıcı veya sizin eklediğiniz verilerle beslenir. İzinsiz kazıma yapılmaz. Veri kaynağı henüz yapılandırılmadığı için liste boştur; sahte rakip verisi gösterilmez.';

export async function listCompetitors(_workspaceId: string): Promise<CompetitorProfile[]> {
  return [];
}

export async function listInsights(_workspaceId: string, competitorId?: string): Promise<CompetitorInsight[]> {
  if (competitorId) return [];
  return [];
}

/** Saf boşluk analizi — gerçek konu verisiyle beslendiğinde fırsat üretir. */
export function contentGapAnalysis(input: { existingTopics: string[]; competitorTopics: string[]; trendTopics: string[] }): { opportunities: string[] } {
  const all = new Set([...input.competitorTopics, ...input.trendTopics]);
  const missing = [...all].filter((t) => !input.existingTopics.includes(t));
  return { opportunities: missing.slice(0, 5) };
}
