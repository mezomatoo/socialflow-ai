import { it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ALL_NAV_ITEMS, NAV_GROUPS } from '../src/lib/ui/nav';
import { FEATURE_FLAGS, featureFlagState } from '../src/lib/brandkit/featureFlags';

it('katalog ve CRM ekranları, API rotaları ve servisleri kaldırıldı', () => {
  for (const path of ['src/app/app/katalog', 'src/app/app/musteriler', 'src/app/api/v1/catalog', 'src/app/api/v1/crm', 'src/lib/catalog', 'src/lib/crm', 'src/lib/business']) {
    assert.equal(existsSync(path), false, path);
  }
});
it('menü ve özellik ayarları kaldırılan modülleri göstermez; eski env bayrakları geri açamaz', () => {
  assert.ok(!NAV_GROUPS.some(g => ['catalog', 'crm'].includes(g.id)));
  assert.ok(!ALL_NAV_ITEMS.some(i => ['/app/katalog', '/app/musteriler'].includes(i.href)));
  const keys = ['FF_PRODUCT_CATALOG', 'FF_SOCIAL_CRM', 'FF_LEAD_MANAGEMENT'];
  const old = keys.map(key => process.env[key]);
  try {
    keys.forEach(key => { process.env[key] = 'true'; });
    for (const key of ['productCatalog', 'socialCRM', 'leadManagement']) {
      assert.ok(!(FEATURE_FLAGS as readonly string[]).includes(key));
      assert.ok(!Object.hasOwn(featureFlagState(), key));
    }
  } finally { keys.forEach((key, i) => { if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i]; }); }
});
it('Gelen Kutusu artık CRM sorgusu/linki taşımaz; diğer ana menüler korunur', () => {
  for (const file of ['src/lib/inbox/service.ts', 'src/lib/inbox/contracts.ts', 'src/app/app/gelen-kutusu/InboxView.tsx']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /crmContactId|contactConversationLink|\/app\/musteriler/);
  }
  for (const href of ['/app/gelen-kutusu', '/app/reklamlar', '/app/hesaplar', '/app/icerik/yeni']) {
    assert.ok(ALL_NAV_ITEMS.some(item => item.href === href), href);
  }
  // Marka Kiti henüz etkin değil: müşteri menüsünde gösterilmez ama yolu ve
  // dürüst bilgilendirme sayfası korunur (route preservation).
  assert.ok(!ALL_NAV_ITEMS.some(item => item.href === '/app/marka-kiti'), 'marka-kiti menüde olmamalı');
  assert.ok(existsSync('src/app/app/marka-kiti/page.tsx'));
});
it('uygulanmış migration geçmişi veri kaybetmemek için korunur', () => {
  for (const name of ['202609150005_product_catalog', '202609150006_crm_leads']) {
    assert.ok(existsSync(`prisma/migrations/${name}/migration.sql`));
  }
});
