import type { BrandKitAggregate } from './types';

/**
 * PHASE 4 — Marka Kiti doluluk skoru (§40)
 * ---------------------------------------------------------------------------
 * Her bölümün ağırlığı vardır; toplam 100. Skor, "dolu" bölümlerin ağırlıkları
 * toplamıdır. Bu, AI/kreatif modüllerinin "marka kiti ne kadar hazır" sinyali
 * olarak kullanılır ve UI'da ilerleme çubuğuyla gösterilir.
 */

export interface CompletenessSection {
  key: string;
  label: string;
  weight: number;
  complete: boolean;
  detail?: string;
}

export interface CompletenessResult {
  score: number; // 0-100
  sections: CompletenessSection[];
}

const has = (v: unknown): boolean =>
  v !== null && v !== undefined && String(v).trim().length > 0;

export function computeCompleteness(kit: BrandKitAggregate): CompletenessResult {
  const sections: CompletenessSection[] = [];

  // 1) Temel bilgiler (10)
  const basicOk =
    has(kit.industry) &&
    (has(kit.shortName) || has(kit.legalName) || has(kit.brand?.name)) &&
    (has(kit.longDescription) || has(kit.shortDescription) || has(kit.brand?.description));
  sections.push({ key: 'basicInfo', label: 'Temel Bilgiler', weight: 10, complete: basicOk });

  // 2) İletişim (8)
  const contactOk = (has(kit.phone) || has(kit.email)) && has(kit.brand?.website);
  sections.push({ key: 'contact', label: 'İletişim', weight: 8, complete: contactOk });

  // 3) Logo (12) — en az bir birincil logo
  const logoOk = kit.logos.some((l) => l.isPrimary || l.usageType === 'PRIMARY');
  sections.push({
    key: 'logo',
    label: 'Logo',
    weight: 12,
    complete: logoOk,
    detail: `${kit.logos.length} logo`
  });

  // 4) Renkler (10) — birincil + en az 2 renk
  const hasPrimaryColor = kit.colors.some((c) => c.category === 'PRIMARY' && !c.prohibited);
  const colorOk = hasPrimaryColor && kit.colors.filter((c) => !c.prohibited).length >= 2;
  sections.push({
    key: 'colors',
    label: 'Renkler',
    weight: 10,
    complete: colorOk,
    detail: `${kit.colors.length} renk`
  });

  // 5) Tipografi (8) — başlık + gövde
  const typoOk =
    kit.typography.some((t) => t.role === 'HEADING') &&
    kit.typography.some((t) => t.role === 'BODY');
  sections.push({
    key: 'typography',
    label: 'Tipografi',
    weight: 8,
    complete: typoOk,
    detail: `${kit.typography.length} font rolü`
  });

  // 6) Marka dili (10) — mevcut BrandVoice
  const voice = kit.brand?.voice;
  const voiceOk = !!voice && (has(voice.tone) || has(voice.personality));
  sections.push({ key: 'brandVoice', label: 'Marka Dili', weight: 10, complete: voiceOk });

  // 7) Slogan & mesajlar (8)
  const messageOk = kit.messages.length > 0;
  sections.push({
    key: 'messages',
    label: 'Slogan ve Mesajlar',
    weight: 8,
    complete: messageOk,
    detail: `${kit.messages.length} mesaj`
  });

  // 8) CTA (6)
  const ctaOk = kit.ctas.length > 0;
  sections.push({ key: 'cta', label: 'CTA', weight: 6, complete: ctaOk, detail: `${kit.ctas.length} CTA` });

  // 9) Hashtag & mention (6)
  const tagOk = kit.hashtags.length > 0 || kit.mentions.length > 0;
  sections.push({
    key: 'hashtagMention',
    label: 'Hashtag ve Mention',
    weight: 6,
    complete: tagOk,
    detail: `${kit.hashtags.length} hashtag, ${kit.mentions.length} mention`
  });

  // 10) Görsel stil (8)
  const visualOk = kit.visualRules.length > 0;
  sections.push({
    key: 'visualRules',
    label: 'Görsel Stil',
    weight: 8,
    complete: visualOk,
    detail: `${kit.visualRules.length} kural`
  });

  // 11) Sosyal medya kuralları (6)
  const platformOk = kit.platformRules.length > 0;
  sections.push({
    key: 'platformRules',
    label: 'Sosyal Medya Kuralları',
    weight: 6,
    complete: platformOk,
    detail: `${kit.platformRules.length} kural`
  });

  // 12) Yasal & kampanya kuralları (8)
  const legalOk = kit.legalRules.length > 0;
  sections.push({
    key: 'legal',
    label: 'Yasal ve Kampanya Kuralları',
    weight: 8,
    complete: legalOk,
    detail: `${kit.legalRules.length} kural`
  });

  const total = sections.reduce((s, x) => s + x.weight, 0); // 100
  const earned = sections.reduce((s, x) => s + (x.complete ? x.weight : 0), 0);
  const score = total === 0 ? 0 : Math.round((earned / total) * 100);

  return { score, sections };
}
