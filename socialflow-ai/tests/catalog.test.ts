import { after, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import prisma from '../src/lib/prisma';
import type { SessionContext } from '../src/lib/auth/session';
import { BusinessError } from '../src/lib/business/access';
import { businessBody, businessResponse } from '../src/lib/business/http';
import { money, createProduct, getProduct, listProducts, updateProduct, addVariant, updateVariant, productFacts } from '../src/lib/catalog/service';
if (!process.env.DATABASE_URL?.endsWith('test.db')) throw Error('Ayrı test DB gerekli.');
let a: SessionContext, b: SessionContext, viewer: SessionContext, brand: string, foreignBrand: string, id: string;
const workspaces: string[] = [];
const code = (c: string) => (e: unknown) => e instanceof BusinessError && e.code === c;
const input = () => ({ brandId: brand, name: 'Gerçek kullanıcı ürünü', description: 'Bilinen açıklama', sku: randomUUID(), variantName: 'Standart', price: '1299.90', currency: 'TRY', stock: 10, confirmed: true });
async function fixture() {
  const w = await prisma.workspace.create({ data: { name: 'Catalog test', slug: randomUUID() } }); workspaces.push(w.id);
  const u = await prisma.user.create({ data: { workspaceId: w.id, email: `${randomUUID()}@test.invalid`, passwordHash: 'no-login', name: 'Test', role: 'OWNER' } });
  return { sessionId: 'test', csrfToken: 'test', user: { ...u, role: 'OWNER', workspaceName: w.name, workspaceSlug: w.slug, demoMode: true } } as SessionContext;
}
before(async () => {
  a = await fixture(); b = await fixture();
  brand = (await prisma.brand.create({ data: { workspaceId: a.user.workspaceId, name: 'A', slug: 'a' } })).id;
  foreignBrand = (await prisma.brand.create({ data: { workspaceId: b.user.workspaceId, name: 'B', slug: 'b' } })).id;
  const v = await prisma.user.create({ data: { workspaceId: a.user.workspaceId, email: `${randomUUID()}@test.invalid`, passwordHash: 'no-login', name: 'Reader', role: 'VIEWER' } }); viewer = { ...a, user: { ...a.user, id: v.id, role: 'VIEWER' } };
  id = (await createProduct(a, input())).id;
});
after(async () => { for (const workspaceId of workspaces) { await prisma.inventoryMovement.deleteMany({ where: { workspaceId } }); await prisma.productVariant.deleteMany({ where: { workspaceId } }); await prisma.product.deleteMany({ where: { workspaceId } }); await prisma.workspace.delete({ where: { id: workspaceId } }); } await prisma.$disconnect(); });
it('kuruş hesaplama tamdır; null ile ücretsiz sıfır ayrıdır', () => {
  assert.equal(money('1299.90', 'TRY'), 129990); assert.equal(money('0.10', 'USD'), 10); assert.equal(money('0', 'EUR'), 0); assert.equal(money(null, 'EUR'), null); assert.equal(money('2.001', 'KWD'), 2001); assert.equal(money('123', 'JPY'), 123);
  for (const [value, currency] of [['2.01','JPY'], ['0.001','TRY'], ['-1','TRY'], ['1e2','TRY'], ['1,20','TRY'], ['9999999999','TRY'], ['1','XYZ']]) assert.throws(() => money(value, currency), code('INVALID_INPUT'));
});
it('ürün merkezi marka doğruluğuna bağlı; stok geçmişi ve audit atomik', async () => {
  const p = await getProduct(a, id); assert.equal(p.brandId, brand); assert.equal(p.variants[0].priceMinor, 129990); assert.equal(p.variants[0].inventory[0].toStock, 10);
  assert.ok(await prisma.auditLog.findFirst({ where: { workspaceId: a.user.workspaceId, entityId: id, action: 'catalog.product.created' } }));
});
it('tenant dışı id/marka ve liste izolasyonu', async () => {
  await assert.rejects(getProduct(b, id), code('NOT_FOUND')); await assert.rejects(createProduct(a, { ...input(), brandId: foreignBrand }), code('NOT_FOUND')); assert.equal((await listProducts(b)).total, 0);
});
it('viewer sahte OWNER rolüyle yazamaz; pasif kullanıcı okuyamaz', async () => {
  await getProduct(viewer, id); await assert.rejects(createProduct({ ...viewer, user: { ...viewer.user, role: 'OWNER' } }, input()), code('FORBIDDEN'));
  await prisma.user.update({ where: { id: viewer.user.id }, data: { isActive: false } });
  await assert.rejects(getProduct(viewer, id), code('FORBIDDEN')); await prisma.user.update({ where: { id: viewer.user.id }, data: { isActive: true } });
});
it('onay, veri şekli, bilinmeyen alan ve negatif stok denetimi', async () => {
  await assert.rejects(createProduct(a, { ...input(), confirmed: false }), code('CONFIRMATION_REQUIRED'));
  await assert.rejects(createProduct(a, { ...input(), workspaceId: b.user.workspaceId }), code('INVALID_INPUT'));
  await assert.rejects(createProduct(a, { ...input(), stock: -1 }), code('INVALID_INPUT'));
});
it('SKU büyük/küçük harf normalize ve workspace içinde tekil; çakışma rollback', async () => {
  const p = await getProduct(a, id); const before = await prisma.product.count();
  await assert.rejects(createProduct(a, { ...input(), sku: p.variants[0].sku.toLowerCase() })); assert.equal(await prisma.product.count(), before);
});
it('bilinmeyen fiyat/stok uydurulmaz; fact reader kaynağı/tarihi taşır', async () => {
  const p = await createProduct(a, { ...input(), price: null, stock: null }); const facts = await productFacts(a, p.id);
  assert.equal(facts.source, 'USER_PROVIDED'); assert.equal(facts.variants[0].priceMinor, null); assert.equal(facts.variants[0].stock, null); assert.ok(facts.variants[0].verifiedAt);
});
it('stok sayımı/price update sürümlü ve gerekçeli; tekrar aynı sürüm reddedilir', async () => {
  const v = (await getProduct(a, id)).variants[0];
  await updateVariant(a, v.id, { version: v.version, price: '1300.00', stock: 8, reason: 'Fiziksel stok sayımı', confirmed: true });
  await assert.rejects(updateVariant(a, v.id, { version: v.version, price: '1', stock: 1, reason: 'Eski sekme', confirmed: true }), code('CONFLICT'));
  const actual = (await getProduct(a, id)).variants[0]; assert.equal(actual.stock, 8); assert.equal(actual.priceMinor, 130000); assert.equal(actual.inventory.length, 2); assert.ok(actual.inventory.some(m => m.fromStock === 10 && m.toStock === 8));
  await assert.rejects(updateVariant(a, v.id, { version: actual.version, price: '1300', stock: null, reason: 'Sil', confirmed: true }), code('INVALID_INPUT'));
});
it('tenant dışı varyant güncelleme ve ekleme reddi', async () => {
  const p = await getProduct(a, id);
  await assert.rejects(updateVariant(b, p.variants[0].id, { version: 2, price: '1', stock: 1, reason: 'Test', confirmed: true }), code('NOT_FOUND'));
  const { brandId, name, description, ...variant } = input();
  await assert.rejects(addVariant(b, id, { ...variant, version: p.version }), code('NOT_FOUND'));
});
it('varyant ekleme product sürümünü de artırır', async () => {
  const p = await getProduct(a, id); const { brandId, name, description, ...variant } = input(); await addVariant(a, id, { ...variant, version: p.version });
  const actual = await getProduct(a, id); assert.equal(actual.variants.length, 2); assert.equal(actual.version, p.version + 1);
});
it('arşiv soft delete: geçmiş kalır, fact reader ve stok mutasyonu durur', async () => {
  const p = await getProduct(a, id); await updateProduct(a, id, { name: p.name, description: p.description, status: 'ARCHIVED', version: p.version });
  const archived = await getProduct(a, id); assert.equal(archived.variants.length, 2);
  await assert.rejects(productFacts(a, id), code('ARCHIVED'));
  await assert.rejects(updateVariant(a, archived.variants[0].id, { version: archived.variants[0].version, price: '1', stock: 1, reason: 'Test', confirmed: true }), code('ARCHIVED'));
  assert.ok(!(await listProducts(a)).items.some(p => p.id === id)); assert.ok((await listProducts(a, new URLSearchParams({ status: 'ARCHIVED' }))).items.some(p => p.id === id));
});
it('katalog bayrağı API servislerini kapatır', async () => {
  const old = process.env.FF_PRODUCT_CATALOG; process.env.FF_PRODUCT_CATALOG = 'false';
  try { await assert.rejects(getProduct(a, id), code('FEATURE_DISABLED')); } finally { if (old === undefined) delete process.env.FF_PRODUCT_CATALOG; else process.env.FF_PRODUCT_CATALOG = old; }
});
it('DB composite FK tenant dışı ürünü/markayı engeller', async () => {
  await assert.rejects(prisma.product.create({ data: { workspaceId: a.user.workspaceId, brandId: foreignBrand, name: 'cross' } }));
  await assert.rejects(prisma.productVariant.create({ data: { workspaceId: b.user.workspaceId, productId: id, sku: 'CROSS', name: 'cross', currency: 'TRY', currencyScale: 2 } }));
});
it('hata zarfı hassas metni gizler; büyük gövde reddedilir', async () => {
  const r = await businessResponse(async () => { throw Error('private'); }); assert.equal(r.status, 500); assert.ok(!(await r.text()).includes('private')); assert.equal(r.headers.get('cache-control'), 'no-store');
  await assert.rejects(businessBody(new Request('https://test.invalid', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(17000) }) })), code('TOO_LARGE'));
});
