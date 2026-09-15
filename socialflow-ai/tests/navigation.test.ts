/**
 * Navigasyon düzenliliği (Faz 4 §13-§16, §142)
 * ---------------------------------------------------------------------------
 * - "Sonraki Faz Modülleri" gibi geliştirme-fazı kategorileri müşteri menüsünde
 *   olmamalıdır.
 * - Ürün / Mağaza / Fırsat modülleri aktif menüde yer almamalıdır.
 * - Gerçek modüller doğru işlevsel kategorilerde görünür.
 * - Geliştirme fazı terminolojisi ("Faz 1", "Faz 2"...) müşteri menüsünde geçmez.
 */
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALL_NAV_ITEMS, NAV_GROUPS } from '../src/lib/ui/nav';

it('menüde geliştirme fazı kategorisi yoktur', () => {
  const bannedLabels = ['sonraki faz', 'sonraki faz modülleri', 'gelecek modüller', 'faz modülleri', 'diğer', 'test'];
  for (const group of NAV_GROUPS) {
    for (const banned of bannedLabels) {
      assert.ok(!group.label.toLowerCase().includes(banned), `grup etiketi faz/modül terminolojisi taşıyor: ${group.label}`);
    }
  }
  assert.ok(!NAV_GROUPS.some((g) => ['phase1', 'phase2', 'next-phase'].includes(g.id)));
});

it('ürün / mağaza / fırsat navigasyonu yoktur', () => {
  const banned = ['/app/katalog', '/app/musteriler', '/app/urunler', '/app/magaza', '/app/firsatlar'];
  for (const href of banned) {
    assert.ok(!ALL_NAV_ITEMS.some((i) => i.href === href), href);
  }
  for (const group of NAV_GROUPS) {
    assert.ok(!/ürün|mağaza|fırsat|product|store|opportunit/i.test(group.label), group.label);
  }
});

it('gerçek modüller doğru işlevsel kategorilerdedir', () => {
  const expect = (href: string, groupId: string) => {
    const item = ALL_NAV_ITEMS.find((i) => i.href === href);
    assert.ok(item, `${href} menüde yok`);
    assert.equal(item.group, groupId, `${href} grubu ${item.group}, beklenen ${groupId}`);
  };
  expect('/app/icerik/yeni', 'content');
  expect('/app/icerik/taslaklar', 'content');
  expect('/app/icerik/planlananlar', 'content');
  expect('/app/icerik/yayinlananlar', 'content');
  expect('/app/takvim', 'content');
  expect('/app/markalar', 'brand');
  expect('/app/marka-kiti', 'brand');
  expect('/app/ai-studio', 'ai');
  expect('/app/ai-planlayici', 'ai');
  expect('/app/medya', 'media');
  expect('/app/hesaplar', 'accounts');
  expect('/app/analizler', 'performance');
  expect('/app/bildirimler', 'system');
  expect('/app/ayarlar', 'system');
  // Yinelenen menü girdisi yok
  const hrefs = ALL_NAV_ITEMS.map((i) => i.href);
  assert.equal(new Set(hrefs).size, hrefs.length, 'menüde yinelenen öğe var');
});

it('müşteriye dönük sayfa metinlerinde faz terminolojisi yoktur', () => {
  const files = [
    'src/components/ui/PhaseNotice.tsx',
    'src/app/app/dashboard/DashboardView.tsx',
    'src/app/app/icerik/[id]/ComposerView.tsx',
    'src/app/app/markalar/[id]/page.tsx'
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // JSX metinlerinde "Faz N" geçmemeli (kod yorumlarına izin verilmez; temiz olması için hiçbir yerde olmasın)
    assert.doesNotMatch(source, /Faz\s*\d/, `${file} içinde "Faz N" ifadesi var`);
  }
});
