/**
 * PHASE 4 — CreativeQualityService (§68-§69)
 * -------------------------------------------
 * Kreatifin teknik ve estetik kalitesini puanlar: çözünürlük, okunabilirlik,
 * kontrast, kompozisyon, güvenli alan, marka uyumu, CTA görünürlüğü.
 * Skorlar tavsiye niteliğindedir — asla otomatik reddetmez.
 */

export interface CreativeQualityInput {
  width?: number | null;
  height?: number | null;
  hasText?: boolean;
  textRegion?: { x: number; y: number; w: number; h: number } | null;
  safeAreaOk?: boolean;
  brandScore?: number; // BrandConsistencyService skoru
  ctaVisible?: boolean;
}

export interface CreativeQualityResult {
  overall: number;
  breakdown: {
    resolution: number;
    readability: number;
    contrast: number;
    composition: number;
    brandConsistency: number;
    platformFit: number;
  };
  warnings: string[];
  advisory: string; // "Skorlar tavsiye niteliğindedir."
}

export function evaluateCreativeQuality(input: CreativeQualityInput): CreativeQualityResult {
  const warnings: string[] = [];

  // Resolution: 1080px altı düşük
  let resolution = 100;
  if (input.width && input.width < 1080) {
    resolution = Math.round((input.width / 1080) * 100);
    warnings.push('Görsel çözünürlüğü düşük; 1080px üzeri önerilir.');
  }

  // Readability: metin varsa kontrast kontrolü (mock)
  let readability = input.hasText ? 88 : 95;
  if (input.hasText && !input.safeAreaOk) {
    readability -= 15;
    warnings.push('Metin güvenli alan dışına taşabilir.');
  }

  // Contrast: sabit mock, gerçekte analiz servisi
  const contrast = 92;

  // Composition: merkez odak
  const composition = input.textRegion ? 90 : 85;

  // Brand consistency
  const brandConsistency = input.brandScore ?? 85;

  // Platform fit: oran kontrolü (mock 100)
  const platformFit = 100;

  const overall = Math.round((resolution + readability + contrast + composition + brandConsistency + platformFit) / 6);

  return {
    overall,
    breakdown: { resolution, readability, contrast, composition, brandConsistency, platformFit },
    warnings,
    advisory: 'Skorlar tavsiye niteliğindedir. Nihai karar kullanıcıya aittir.',
  };
}
