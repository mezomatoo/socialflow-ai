import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import type { SessionContext } from '../auth/session';
import { BusinessError, businessActor, fields, text, revision, missing, conflict, WRITE_ROLES } from '../business/access';
// Explicit supported currencies; no guessing the number of minor units or FX conversion.
export const CURRENCIES: Record<string, number> = { TRY: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0, KWD: 3 };
export function money(value: unknown, currency: string): number | null {
  if (!Object.hasOwn(CURRENCIES, currency)) throw new BusinessError('INVALID_INPUT', 'Desteklenmeyen para birimi.');
  if (value === null || value === '') return null;
  const scale = CURRENCIES[currency];
  if (typeof value !== 'string' || !new RegExp(`^\\d{1,10}${scale ? `(\\.\\d{1,${scale}})?` : ''}$`).test(value)) throw new BusinessError('INVALID_INPUT', 'Fiyat geçerli bir ondalık metin olmalıdır.');
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 10 ** scale + Number(fraction.padEnd(scale, '0'));
  if (!Number.isSafeInteger(result) || result > 2147483647) throw new BusinessError('INVALID_INPUT', 'Fiyat izin verilen aralığı aşıyor.');
  return result;
}
function stock(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 2147483647) throw new BusinessError('INVALID_INPUT', 'Stok negatif olmayan tam sayı veya bilinmiyor olmalıdır.');
  return value as number;
}
async function audit(tx: Prisma.TransactionClient, workspaceId: string, userId: string, action: string, id: string, metadata: unknown) {
  await tx.auditLog.create({ data: { workspaceId, userId, action, entityType: 'Product', entityId: id, metadata: JSON.stringify(metadata) } });
}
function variantInput(input: Record<string, unknown>) {
  const currency = text(input.currency, 'Para birimi', 3).toUpperCase();
  if (input.confirmed !== true) throw new BusinessError('CONFIRMATION_REQUIRED', 'Ürün bilgilerini doğruladığınızı onaylayın.');
  return { sku: text(input.sku, 'SKU', 80).toUpperCase(), name: text(input.variantName, 'Varyant adı', 120), currency, currencyScale: CURRENCIES[currency], priceMinor: money(input.price, currency), stock: stock(input.stock), verifiedAt: new Date() };
}
export async function catalogOptions(session: SessionContext) {
  const actor = await businessActor(session, 'productCatalog');
  return { canWrite: WRITE_ROLES.includes(actor.role), currencies: Object.keys(CURRENCIES), brands: await prisma.brand.findMany({ where: { workspaceId: actor.workspaceId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) };
}
export async function listProducts(session: SessionContext, params = new URLSearchParams()) {
  const actor = await businessActor(session, 'productCatalog');
  const q = params.get('q') || '', brandId = params.get('brand') || '', status = params.get('status') || 'ACTIVE', raw = params.get('page') || '1';
  if (q.length > 100 || !['ACTIVE', 'ARCHIVED', 'ALL'].includes(status) || !/^\d{1,4}$/.test(raw) || +raw < 1) throw new BusinessError('INVALID_INPUT', 'Geçersiz filtre.');
  const where = { workspaceId: actor.workspaceId, ...(brandId ? { brandId } : {}), ...(status === 'ALL' ? {} : { status }), ...(q ? { OR: [{ name: { contains: q } }, { variants: { some: { sku: { contains: q.toUpperCase() } } } }] } : {}) };
  const [items, total] = await Promise.all([prisma.product.findMany({ where, include: { brand: { select: { name: true } }, variants: { orderBy: { sku: 'asc' }, take: 50 } }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (+raw - 1) * 20, take: 20 }), prisma.product.count({ where })]);
  return { items, total, page: +raw };
}
export async function getProduct(session: SessionContext, id: string) {
  const actor = await businessActor(session, 'productCatalog');
  const product = await prisma.product.findFirst({ where: { id, workspaceId: actor.workspaceId }, include: { brand: { select: { name: true } }, variants: { orderBy: { sku: 'asc' }, take: 50, include: { inventory: { orderBy: { createdAt: 'desc' }, take: 20 } } } } });
  return product ?? missing();
}
export async function createProduct(session: SessionContext, input: Record<string, unknown>) {
  const actor = await businessActor(session, 'productCatalog', true);
  fields(input, ['brandId', 'name', 'description', 'sku', 'variantName', 'price', 'currency', 'stock', 'confirmed']);
  const brandId = text(input.brandId, 'Marka', 100), name = text(input.name, 'Ürün adı'), description = text(input.description, 'Açıklama', 4000, true), variant = variantInput(input);
  return prisma.$transaction(async tx => {
    if (!await tx.brand.findFirst({ where: { id: brandId, workspaceId: actor.workspaceId } })) missing();
    const product = await tx.product.create({ data: { workspaceId: actor.workspaceId, brandId, name, description } });
    const v = await tx.productVariant.create({ data: { ...variant, workspaceId: actor.workspaceId, productId: product.id } });
    if (v.stock !== null) await tx.inventoryMovement.create({ data: { workspaceId: actor.workspaceId, variantId: v.id, fromStock: null, toStock: v.stock, reason: 'Kullanıcı tarafından doğrulanan başlangıç stoku', actorId: actor.id } });
    await audit(tx, actor.workspaceId, actor.id, 'catalog.product.created', product.id, { variantId: v.id, source: 'USER_PROVIDED' });
    return { id: product.id };
  });
}
export async function updateProduct(session: SessionContext, id: string, input: Record<string, unknown>) {
  const actor = await businessActor(session, 'productCatalog', true); fields(input, ['name', 'description', 'status', 'version']);
  const version = revision(input.version), name = text(input.name, 'Ürün adı'), description = text(input.description, 'Açıklama', 4000, true);
  if (!['ACTIVE', 'ARCHIVED'].includes(input.status as string)) throw new BusinessError('INVALID_INPUT', 'Geçersiz ürün durumu.');
  return prisma.$transaction(async tx => {
    const old = await tx.product.findFirst({ where: { workspaceId: actor.workspaceId, id } }); if (!old) missing();
    const result = await tx.product.updateMany({ where: { workspaceId: actor.workspaceId, id, version }, data: { name, description, status: input.status as string, version: { increment: 1 } } }); if (result.count !== 1) conflict();
    await audit(tx, actor.workspaceId, actor.id, 'catalog.product.updated', id, { version: version + 1, oldStatus: old.status, newStatus: input.status }); return { id };
  });
}
export async function addVariant(session: SessionContext, id: string, input: Record<string, unknown>) {
  const actor = await businessActor(session, 'productCatalog', true); fields(input, ['version', 'sku', 'variantName', 'price', 'currency', 'stock', 'confirmed']);
  const version = revision(input.version), variant = variantInput(input);
  return prisma.$transaction(async tx => {
    const p = await tx.product.findFirst({ where: { id, workspaceId: actor.workspaceId } }); if (!p) missing();
    if (p.status !== 'ACTIVE') throw new BusinessError('ARCHIVED', 'Arşivlenmiş ürün değiştirilemez.', 409);
    if (await tx.productVariant.count({ where: { productId: id, workspaceId: actor.workspaceId } }) >= 50) throw new BusinessError('LIMIT', 'Bu sürümde ürün başına en fazla 50 varyant desteklenir.');
    if ((await tx.product.updateMany({ where: { id, workspaceId: actor.workspaceId, version }, data: { version: { increment: 1 } } })).count !== 1) conflict();
    const v = await tx.productVariant.create({ data: { ...variant, productId: id, workspaceId: actor.workspaceId } });
    if (v.stock !== null) await tx.inventoryMovement.create({ data: { workspaceId: actor.workspaceId, variantId: v.id, fromStock: null, toStock: v.stock, reason: 'Kullanıcı tarafından doğrulanan başlangıç stoku', actorId: actor.id } });
    await audit(tx, actor.workspaceId, actor.id, 'catalog.variant.created', id, { variantId: v.id }); return { id: v.id };
  });
}
export async function updateVariant(session: SessionContext, id: string, input: Record<string, unknown>) {
  const actor = await businessActor(session, 'productCatalog', true); fields(input, ['version', 'price', 'stock', 'reason', 'confirmed']); const version = revision(input.version);
  if (input.confirmed !== true) throw new BusinessError('CONFIRMATION_REQUIRED', 'Fiyat ve stok değişikliğini onaylayın.');
  const toStock = stock(input.stock), reason = text(input.reason, 'Değişiklik gerekçesi', 500);
  return prisma.$transaction(async tx => {
    const v = await tx.productVariant.findFirst({ where: { id, workspaceId: actor.workspaceId }, include: { product: true } }); if (!v) missing();
    if (v.product.status !== 'ACTIVE') throw new BusinessError('ARCHIVED', 'Arşivlenmiş ürün değiştirilemez.', 409);
    // Once stock has evidence, losing its history by setting unknown is not allowed.
    if (v.stock !== null && toStock === null) throw new BusinessError('INVALID_INPUT', 'Kayıtlı stok bilinmiyora çevrilemez. Sayım sonucunu girin.');
    const priceMinor = money(input.price, v.currency);
    if ((await tx.productVariant.updateMany({ where: { id, workspaceId: actor.workspaceId, version }, data: { priceMinor, stock: toStock, verifiedAt: new Date(), version: { increment: 1 } } })).count !== 1) conflict();
    await tx.product.update({ where: { id: v.productId }, data: { version: { increment: 1 } } });
    if (toStock !== null && toStock !== v.stock) await tx.inventoryMovement.create({ data: { workspaceId: actor.workspaceId, variantId: id, fromStock: v.stock, toStock, reason, actorId: actor.id } });
    await audit(tx, actor.workspaceId, actor.id, 'catalog.variant.updated', v.productId, { variantId: id, oldPriceMinor: v.priceMinor, priceMinor, oldStock: v.stock, stock: toStock, reason, version: version + 1 }); return { id };
  });
}
// Server-side fact reader for future AI/commerce adapters. Does not send data to an LLM.
export async function productFacts(session: SessionContext, id: string) {
  const p = await getProduct(session, id); if (p.status !== 'ACTIVE') throw new BusinessError('ARCHIVED', 'Arşivlenmiş ürün yanıt kaynağı olamaz.', 409);
  return { id: p.id, name: p.name, description: p.description, brandId: p.brandId, source: 'USER_PROVIDED', variants: p.variants.map(v => ({ sku: v.sku, name: v.name, priceMinor: v.priceMinor, currency: v.currency, currencyScale: v.currencyScale, stock: v.stock, verifiedAt: v.verifiedAt })) };
}
export type CatalogOptions = Awaited<ReturnType<typeof catalogOptions>>;
// JSON wire representation used by client; no server runtime import.
export type ProductDetail = Omit<Awaited<ReturnType<typeof getProduct>>, 'createdAt' | 'updatedAt' | 'variants'> & { createdAt: string; updatedAt: string; variants: Array<Omit<Awaited<ReturnType<typeof getProduct>>['variants'][number], 'createdAt' | 'updatedAt' | 'verifiedAt' | 'inventory'> & { createdAt: string; updatedAt: string; verifiedAt: string | null; inventory: Array<{ id: string; fromStock: number | null; toStock: number; reason: string; createdAt: string }> }> };
