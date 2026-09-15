/**
 * PHASE 4 — PerformancePredictionService (§90-§92) - Experimental
 * Asla garanti vermez; "geçmiş performansınıza göre ..." dili kullanır.
 */

export interface PredictionInput {
  platform: string;
  format?: string | null;
  publishAt?: string | null;
  captionLength?: number | null;
  mediaType?: string | null;
  creativeScore?: number | null;
}

export interface PredictionResult {
  level: 'low' | 'medium' | 'high';
  label: string;
  reason: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  dataRange: string;
}

export async function predictPerformance(input: PredictionInput, historical?: { avgEngagement: number } | null): Promise<PredictionResult> {
  // Mock heuristics
  const base = historical?.avgEngagement ?? 3.2;
  let score = base;
  if ((input.captionLength ?? 0) > 200) score -= 0.3;
  if ((input.creativeScore ?? 70) > 85) score += 0.8;
  if (input.platform === 'INSTAGRAM') score += 0.2;
  const level: PredictionResult['level'] = score > 4 ? 'high' : score > 3 ? 'medium' : 'low';
  const labels: Record<string, string> = {
    high: 'Geçmiş performansınıza göre ortalamanın üzerinde etkileşim potansiyeli gösteriyor.',
    medium: 'Ortalama etkileşim bekleniyor.',
    low: 'Düşük etkileşim potansiyeli — saat veya kreatif optimizasyonu önerilir.',
  };
  return {
    level,
    label: labels[level],
    reason: `Tahmini skor ${score.toFixed(1)} (tarihsel ort. ${base.toFixed(1)})`,
    confidence: level === 'high' ? 'MEDIUM' : 'LOW',
    dataRange: 'Son 30 gün, 42 içerik',
  };
}
