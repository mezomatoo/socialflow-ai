/**
 * PHASE 4 — Semantik Medya & İçerik Arama (§128-§131)
 * Workspace izole embedding'ler. Basit demo: metin içerme + TF-IDF benzeri skor.
 */

export interface SearchResult {
  id: string;
  type: 'MEDIA' | 'CONTENT' | 'PRODUCT' | 'CAMPAIGN';
  title: string;
  snippet: string;
  score: number;
  workspaceId: string;
}

const demoIndex: SearchResult[] = [
  { id: 'media-1', type: 'MEDIA', title: 'Kadın elinde serum tutuyor', snippet: 'Premium siyah arka plan, stüdyo ışığı', score: 0.92, workspaceId: 'demo-workspace-id' },
  { id: 'media-2', type: 'MEDIA', title: 'Motor kurye fotoğrafı', snippet: 'Hızlı teslimat, şehir arka plan', score: 0.85, workspaceId: 'demo-workspace-id' },
  { id: 'content-1', type: 'CONTENT', title: 'Etiyopya lansman metni', snippet: 'Yeni sezon, %15 indirim', score: 0.88, workspaceId: 'demo-workspace-id' },
];

export async function semanticSearch(workspaceId: string, query: string, type?: SearchResult['type']): Promise<SearchResult[]> {
  const q = query.toLowerCase();
  const filtered = demoIndex
    .filter((r) => r.workspaceId === workspaceId)
    .filter((r) => !type || r.type === type)
    .map((r) => ({ ...r, score: r.title.toLowerCase().includes(q) || r.snippet.toLowerCase().includes(q) ? r.score : r.score * 0.4 }))
    .sort((a, b) => b.score - a.score);
  return filtered.filter((r) => r.score > 0.35);
}

export async function findSimilar(workspaceId: string, entityId: string): Promise<SearchResult[]> {
  // Mock: benzer içerik önerisi
  return demoIndex.filter((r) => r.workspaceId === workspaceId && r.id !== entityId).slice(0, 3);
}

export const SEMANTIC_ISOLATION_NOTE = 'Embedding sonuçları yalnızca kendi çalışma alanınıza aittir; başka çalışma alanının verisi asla dönmez.';
