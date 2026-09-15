import { it } from 'node:test';
import assert from 'node:assert/strict';
import { advertisingRegistry, createAdvertisingRegistry, UnavailableAdvertisingProvider } from '../src/lib/advertising/registry';
import { AD_CAPABILITIES, AdvertisingError, measuredMetric, unavailableMetric } from '../src/lib/advertising/contracts';
import { canAdvertising, rejectFinancialWrite } from '../src/lib/advertising/permissions';
it('sağlayıcı dizini yedi kayıt içerir; YouTube Google Ads altındadır', () => {
  assert.equal(advertisingRegistry.list().length, 7);
  assert.ok(advertisingRegistry.get('GOOGLE').info.placementsLabel.includes('YouTube'));
  assert.throws(() => advertisingRegistry.get('YOUTUBE'), AdvertisingError);
});
it('uygulanmamış API yetenekleri kapalıdır, sahte boş sağlayıcı verisi dönmez', async () => {
  for (const adapter of advertisingRegistry.list()) {
    assert.equal(Object.keys(adapter.getCapabilities()).length, AD_CAPABILITIES.length);
    assert.ok(Object.values(adapter.getCapabilities()).every(v => v === false));
    await assert.rejects(adapter.readAdAccounts({ workspaceId: 'test', accessToken: 'never-sent' }), AdvertisingError);
    await assert.rejects(adapter.readCampaigns({ workspaceId: 'test', accessToken: 'never-sent' }, 'id'), AdvertisingError);
  }
});
it('yeni sağlayıcı core değişmeden registryye eklenir; duplicate ve bilinmeyen kod reddedilir', () => {
  const custom = new UnavailableAdvertisingProvider({ code: 'FUTURE', name: 'Future', placementsLabel: 'Test', color: '#000' });
  assert.equal(createAdvertisingRegistry([custom]).get('FUTURE'), custom);
  assert.throws(() => createAdvertisingRegistry([custom, custom]));
  assert.throws(() => advertisingRegistry.get('__proto__'), AdvertisingError);
});
it('ölçülmüş sıfır, eksik veri ve sağlanmayan veri birbirinden ayrılır', () => {
  assert.deepEqual(measuredMetric(0), { value: 0, availability: 'AVAILABLE' });
  assert.deepEqual(unavailableMetric(), { value: null, availability: 'NOT_SYNCED' });
  assert.deepEqual(unavailableMetric('NOT_PROVIDED'), { value: null, availability: 'NOT_PROVIDED' });
  assert.throws(() => measuredMetric(NaN));
});
it('finansal yetkiler viewer/creator için yok; flag tek başına harcamayı açamaz', () => {
  assert.equal(canAdvertising('VIEWER', 'ads:view'), true);
  assert.equal(canAdvertising('VIEWER', 'ads:budget_edit'), false);
  assert.equal(canAdvertising('CREATOR', 'ads:publish'), false);
  assert.equal(canAdvertising('EDITOR', 'ads:accounts_manage'), false);
  assert.equal(canAdvertising('OWNER', 'ads:accounts_manage'), true);
  assert.equal(canAdvertising('unknown', 'ads:view'), false);
  const previous = process.env.FF_PAID_MEDIA_WRITE; process.env.FF_PAID_MEDIA_WRITE = 'true';
  try { assert.throws(rejectFinancialWrite, e => e instanceof AdvertisingError && e.code === 'PAID_MEDIA_WRITE_DISABLED'); }
  finally { if (previous === undefined) delete process.env.FF_PAID_MEDIA_WRITE; else process.env.FF_PAID_MEDIA_WRITE = previous; }
});
