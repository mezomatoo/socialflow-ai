/**
 * BrandConsistencyService (Faz 4 §40-§41, §132-§133)
 * ---------------------------------------------------------------------------
 * - DETERMİNİSTİK kurallar (yasaklı kelime, yasak CTA/renk/hashtag) kilit
 *   moduna göre engeller.
 * - Yalnız AI danışsal görüşü ASLA engellemez; uyarı üretir.
 * - Sonuç kit sürümünü taşır (izlenebilirlik).
 */
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { checkBrandConsistency } from '../src/lib/ai/brandConsistency';

const baseKit = {
  currentVersion: 3,
  lockMode: 'STRICT',
  consistencyGate: 'WARNING',
  colors: [{ hex: '#6D28D9', prohibited: false }],
  ctas: [
    { text: 'Şimdi İncele', category: 'PREFERRED', approvalStatus: 'APPROVED' },
    { text: 'Kötü CTA', category: 'FORBIDDEN', approvalStatus: 'APPROVED' }
  ],
  hashtags: [{ tag: 'kotuetiket', category: 'BANNED' }],
  logos: [{ id: 'l1' }],
  legalRules: [],
  brand: { voice: { bannedTerms: 'ucuz', tone: 'Samimi' } }
};

it('§132 — STRICT kilitte yasak CTA engelleyici ihlaldir', () => {
  const r = checkBrandConsistency({
    brandKit: baseKit,
    content: { caption: 'Yeni sezon lezzetler', cta: 'Kötü CTA', hashtags: '#kahve' }
  });
  const cta = r.checks.find((c) => c.key === 'cta')!;
  assert.equal(cta.ok, false);
  assert.equal(cta.severity, 'fail');
  assert.equal(cta.deterministic, true);
  assert.equal(r.gate, 'BLOCK');
});

it('§132 — STRICT kilitte yasaklı kelime engelleyici ihlaldir', () => {
  const r = checkBrandConsistency({
    brandKit: baseKit,
    content: { caption: 'Çok ucuz fiyatlar!', hashtags: '' }
  });
  assert.equal(r.checks.find((c) => c.key === 'bannedWords')!.severity, 'fail');
  assert.equal(r.gate, 'BLOCK');
});

it('§133 — yalnız danışsal eksiklik (logo) engellemez, uyarı verir', () => {
  const kit = { ...baseKit, logos: [], lockMode: 'STRICT' };
  const r = checkBrandConsistency({
    brandKit: kit,
    content: { caption: 'Harika bir gün', hashtags: '#nitelikkahve', cta: 'Şimdi İncele' }
  });
  const logo = r.checks.find((c) => c.key === 'logo')!;
  assert.equal(logo.ok, false);
  assert.equal(logo.deterministic, false, 'logo eksikliği danışsal olmalı');
  assert.notEqual(r.gate, 'BLOCK', 'yalnız AI/danışsal görüş engelleyemez');
});

it('OFF kilitte kesin kural ihlali bile engellemez, uyarıya düşer', () => {
  const r = checkBrandConsistency({
    brandKit: { ...baseKit, lockMode: 'OFF' },
    content: { caption: 'ucuz ürün', hashtags: '#kotuetiket' }
  });
  assert.notEqual(r.gate, 'BLOCK');
  assert.equal(r.lockMode, 'OFF');
});

it('§131 — sonuç kit sürümünü taşır; içerik sürümle ilişkilendirilebilir', () => {
  const r = checkBrandConsistency({
    brandKit: baseKit,
    content: { caption: 'selam', hashtags: '' }
  });
  assert.equal(r.brandKitVersion, 3);
});

it('zorunlu hukuki metin eksikliği kesin kuraldır', () => {
  const kit = {
    ...baseKit,
    lockMode: 'STANDARD',
    legalRules: [
      { id: 'lr1', category: 'DISCLAIMER', requiredText: 'Koşullar geçerlidir.', approvalStatus: 'APPROVED' }
    ]
  };
  const r = checkBrandConsistency({
    brandKit: kit,
    content: { caption: 'Büyük indirim!', hashtags: '' }
  });
  const legal = r.checks.find((c) => c.key === 'legal:lr1')!;
  assert.ok(legal, 'hukuki kontrol raporda olmalı');
  assert.equal(legal.ok, false);
  assert.equal(legal.deterministic, true);
  assert.equal(r.gate, 'REQUIRE_APPROVAL', 'STANDARD kilitte kesin ihlal onay gerektirir');
});
