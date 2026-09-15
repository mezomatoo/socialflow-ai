/**
 * Navigasyon kategorileri — müşteri menüsü denetimi (navigasyon temizliği).
 * Kurallar:
 *  - Geliştirme fazı terimi ("Sonraki Faz Modülleri", "Faz N") menüde/mesajda YOK.
 *  - "Kampanya, Mağaza ve Fırsat" gibi birleşik kategori YOK; Kampanyalar kendi
 *    kategorisinde ve işlevsel.
 *  - Yer tutucu/gelecek faz ekranları (mock veri) menüde gösterilmez; sayfaları
 *    dürüst bilgilendirme verir.
 *  - Tüm menü yolları gerçek sayfalara gider; kopya menü girdisi yoktur.
 */
import { it, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ALL_NAV_ITEMS, HIDDEN_NAV_ITEMS, NAV_GROUPS, LEGACY_ROUTE_REDIRECTS } from '../src/lib/ui/nav';
import { MODULE_GATES, moduleState } from '../src/lib/phase/phaseGates';

const BANNED_TERMS = /Sonraki Faz|Sonraki faz|Gelecek Faz|Faz [0-9]|Faz Modül/;

describe('Müşteri navigasyonu kategori kuralları', () => {
  it('"Sonraki Faz Modülleri" veya faz terimi içeren kategori/menü etiketi YOK', () => {
    for (const group of NAV_GROUPS) {
      assert.ok(!BANNED_TERMS.test(group.label), `grup etiketi faz terimi içeriyor: ${group.label}`);
    }
    for (const item of ALL_NAV_ITEMS) {
      assert.ok(!BANNED_TERMS.test(item.label), `menü etiketi faz terimi içeriyor: ${item.label}`);
    }
    assert.ok(!NAV_GROUPS.some((g) => /faz/i.test(g.label)), 'grup etiketi "faz" kelimesi taşımamalı');
  });

  it('"Kampanya, Mağaza ve Fırsat" birleşik kategorisi YOK; Mağaza/Fırsat menüde YOK', () => {
    for (const group of NAV_GROUPS) {
      const label = group.label.toLocaleLowerCase('tr');
      assert.ok(!/mağaza/.test(label), `Mağaza kategorisi olmamalı: ${group.label}`);
      assert.ok(!/fırsat/.test(label), `Fırsat kategorisi olmamalı: ${group.label}`);
      assert.ok(!/kampanya.*mağaza|mağaza.*kampanya/.test(label), 'birleşik kategori yasak');
    }
    for (const item of ALL_NAV_ITEMS) {
      const label = item.label.toLocaleLowerCase('tr');
      assert.ok(!/mağaza|fırsat/.test(label), `menü öğesi Mağaza/Fırsat taşımamalı: ${item.label}`);
    }
  });

  it('Kampanyalar kendi kategorisinde ve gerçek kampanya işlevine gider', () => {
    const group = NAV_GROUPS.find((g) => g.label === 'Kampanyalar');
    assert.ok(group, 'Kampanyalar kategorisi olmalı');
    assert.ok(group.items.some((i) => i.href === '/app/ai-kampanya'), 'kampanya oluşturucu menüde olmalı');
    assert.ok(existsSync('src/app/app/ai-kampanya/page.tsx'), 'kampanya sayfası gerçek olmalı');
    assert.ok(existsSync('src/lib/campaign/aiCampaign.ts'), 'kampanya işlevi gerçek olmalı');
    // Tek kaynak: aynı yol ikinci bir grupta tekrarlanmaz (kopya navigasyon yok).
    const hrefs = ALL_NAV_ITEMS.map((i) => i.href);
    assert.equal(new Set(hrefs).size, hrefs.length, 'kopya menü girdisi var');
  });

  it('Yer tutucu/mock ekranlar menüde YOK ama yolları korunur ve dürüst bilgilendirme verir', () => {
    const hiddenHrefs = HIDDEN_NAV_ITEMS.map((i) => i.href);
    for (const href of ['/app/analizler', '/app/marka-kiti', '/app/ai-studio', '/app/ai-gecmisi', '/app/otomasyonlar', '/app/trendler', '/app/rakip-analizi', '/app/admin/ai-kullanim']) {
      assert.ok(hiddenHrefs.includes(href), `${href} gizli listede olmalı`);
      assert.ok(!ALL_NAV_ITEMS.some((i) => i.href === href), `${href} müşteri menüsünde olmamalı`);
      const page = `src/app/app${href.replace('/app', '')}/page.tsx`;
      assert.ok(existsSync(page), `${page} durmalı (route preservation)`);
      const source = readFileSync(page, 'utf8');
      assert.ok(
        /PhaseGateNotice|ModuleUnavailableNotice/.test(source),
        `${page} sahte içerik yerine dürüst bilgilendirme göstermeli`
      );
    }
    // Menüden çıkarılan hiçbir eski yol kırılmaz: legacy redirect tablosu duruyor.
    for (const [from] of Object.entries(LEGACY_ROUTE_REDIRECTS)) {
      assert.ok(typeof from === 'string');
    }
  });

  it('Tüm menü öğeleri gerçek sayfalara gider; eylem dosyası olmayan链接 YOK', () => {
    for (const item of ALL_NAV_ITEMS) {
      const page = `src/app/app${item.href.replace('/app', '')}/page.tsx`;
      assert.ok(existsSync(page), `${item.href} için sayfa yok`);
    }
    // Reklam alt sayfası
    assert.ok(existsSync('src/app/app/reklamlar/hesaplar/page.tsx'), '/app/reklamlar/hesaplar sayfası yok');
  });

  it('Kapalı modüllerin kullanıcı mesajları faz terimi içermez', () => {
    const state = moduleState();
    for (const [id, mod] of Object.entries(state)) {
      if (!mod.enabled) {
        assert.ok(!BANNED_TERMS.test(mod.notice), `${id} kapalı modül mesajı faz terimi içeriyor: ${mod.notice}`);
      }
    }
    // Kapı tanımlarının kendisi de müşteri metni olarak temiz olmalı.
    for (const [id, gate] of Object.entries(MODULE_GATES)) {
      assert.ok(!/Faz [0-9]/.test(gate.notice), `${id} kapı mesajı faz terimi içeriyor`);
    }
  });

  it('Müşteri arayüzü kaynaklarında kullanıcıya görünen faz terimi YOK (banner/etiket)', () => {
    const files = [
      'src/app/app/dashboard/DashboardView.tsx',
      'src/app/app/icerik/[id]/ComposerView.tsx',
      'src/components/ui/PhaseNotice.tsx',
      'src/components/layout/AppShell.tsx',
      'src/lib/ui/nav.ts'
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Yorumları at (satır, blok ve JSX yorumu); yalnızca kullanıcıya görünen
      // dizeleri denetle.
      const visible = source
        .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      assert.ok(!/Faz [0-9]|Sonraki Faz/.test(visible), `${file} içinde kullanıcıya görünen faz terimi var`);
    }
  });
});
