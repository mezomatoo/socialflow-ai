import { after, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import prisma from '../src/lib/prisma';
import { toCipherText } from '../src/lib/crypto';
import type { SessionContext } from '../src/lib/auth/session';
import { getAdAccount, listAdAccounts, advertisingOverview, mapAdAccountBrand, requestAdvertisingConnection, requestFinancialOperation } from '../src/lib/advertising/service';
import { AdvertisingError } from '../src/lib/advertising/contracts';
import { advertisingResponse, advertisingBody } from '../src/lib/advertising/route';
if (!process.env.DATABASE_URL?.endsWith('test.db')) throw new Error('Yalnızca ayrı test.db kullanın.');
const workspaces: string[] = [];
let a: SessionContext, b: SessionContext, viewer: SessionContext, editor: SessionContext;
let accountId: string, brandA: string, brandB: string;
const code = (value: string) => (e: unknown) => e instanceof AdvertisingError && e.code === value;
async function fixture() {
  const ws = await prisma.workspace.create({ data: { name: 'Ads test', slug: randomUUID() } }); workspaces.push(ws.id);
  const user = await prisma.user.create({ data: { workspaceId: ws.id, name: 'Test', email: `${randomUUID()}@test.invalid`, passwordHash: 'no-login', role: 'OWNER' } });
  const session: SessionContext = { sessionId: 'test', csrfToken: 'test', user: { ...user, role: 'OWNER',
        membershipId: 'membership-1',
        membershipStatus: 'ACTIVE', workspaceName: ws.name, workspaceSlug: ws.slug, demoMode: true } };
  return session;
}
before(async () => {
  a = await fixture(); b = await fixture();
  for (const role of ['VIEWER', 'EDITOR'] as const) {
    const u = await prisma.user.create({ data: { workspaceId: a.user.workspaceId, name: role, email: `${randomUUID()}@test.invalid`, passwordHash: 'no-login', role } });
    const session = { ...a, user: { ...a.user, id: u.id, role } }; if (role === 'VIEWER') viewer = session; else editor = session;
  }
  const ba = await prisma.brand.create({ data: { workspaceId: a.user.workspaceId, name: 'A', slug: 'a' } }); brandA = ba.id;
  const bb = await prisma.brand.create({ data: { workspaceId: b.user.workspaceId, name: 'B', slug: 'b' } }); brandB = bb.id;
  const account = await prisma.adAccount.create({ data: { workspaceId: a.user.workspaceId, provider: 'META', providerAccountId: 'fixture-ad-account', displayName: 'Test reklam hesabı', currency: 'USD', timezone: 'America/New_York', providerTimezone: 'UTC', connectionStatus: 'CONNECTED', lastValidatedAt: new Date() } }); accountId = account.id;
  await prisma.adAccountCredential.create({ data: { workspaceId: a.user.workspaceId, adAccountId: accountId, accessTokenEnc: toCipherText('only-test-ad-token'), expiresAt: new Date(Date.now() + 3600000) } });
  await prisma.adProviderCapability.create({ data: { workspaceId: a.user.workspaceId, adAccountId: accountId, version: 1, capabilities: JSON.stringify({ supportsCampaignCreate: true, supportsAdAccountRead: true }), source: 'PROVIDER', verifiedAt: new Date() } });
});
after(async () => {
  for (const workspaceId of workspaces) {
    await prisma.adProviderCapability.deleteMany({ where: { workspaceId } });
    await prisma.adAccountCredential.deleteMany({ where: { workspaceId } });
    await prisma.adAccount.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
  }
  await prisma.$disconnect();
});
it('hesap DTO token veya şifreli credential içermez; para/saat dilimi korunur', async () => {
  const result = await getAdAccount(a, accountId);
  assert.equal(result.currency, 'USD'); assert.equal(result.timezone, 'America/New_York'); assert.equal(result.providerTimezone, 'UTC');
  const encoded = JSON.stringify(result);
  assert.ok(!encoded.includes('accessTokenEnc')); assert.ok(!encoded.includes('only-test-ad-token')); assert.ok(!encoded.includes('credential'));
  assert.equal(result.connectionStatus, 'CONNECTED');
});
it('workspace dışı id okuma ve marka atama aynı 404 verir', async () => {
  await assert.rejects(getAdAccount(b, accountId), code('NOT_FOUND'));
  await assert.rejects(getAdAccount(b, 'missing'), code('NOT_FOUND'));
  await assert.rejects(mapAdAccountBrand(b, accountId, { brandId: brandB, version: 1 }), code('NOT_FOUND'));
  assert.equal((await listAdAccounts(b)).total, 0);
});
it('marka atama yetki, tenant ve optimistic sürümle atomik audit oluşturur', async () => {
  await assert.rejects(mapAdAccountBrand(a, accountId, { brandId: brandB, version: 1 }), code('NOT_FOUND'));
  assert.equal((await getAdAccount(a, accountId)).version, 1);
  await mapAdAccountBrand(a, accountId, { brandId: brandA, version: 1 });
  assert.equal((await getAdAccount(a, accountId)).brandId, brandA);
  assert.ok(await prisma.auditLog.findFirst({ where: { workspaceId: a.user.workspaceId, action: 'ads.account.brand_mapped', entityId: accountId } }));
  await assert.rejects(mapAdAccountBrand(a, accountId, { brandId: null, version: 1 }), code('CONFLICT'));
});
it('viewer/editor hesap okuyabilir ama yetki yükseltip marka atayamaz', async () => {
  await getAdAccount(viewer, accountId);
  await assert.rejects(mapAdAccountBrand({ ...viewer, user: { ...viewer.user, role: 'OWNER' } }, accountId, { brandId: null, version: 2 }), code('FORBIDDEN'));
  await assert.rejects(mapAdAccountBrand(editor, accountId, { brandId: null, version: 2 }), code('FORBIDDEN'));
});
it('sadece marka alanı değişebilir; status/currency/permissions/budget enjekte edilemez', async () => {
  for (const key of ['connectionStatus', 'currency', 'accessToken', 'budget', 'grantedScopes']) {
    await assert.rejects(mapAdAccountBrand(a, accountId, { brandId: null, version: 2, [key]: 'spoof' }), code('INVALID_INPUT'));
  }
});
it('saklı capability true olsa da uygulanmamış adaptör işlemini açamaz', async () => {
  const result = await getAdAccount(a, accountId);
  assert.ok(Object.values(result.capabilities).every(v => !v));
});
it('harcama/gelir/ROAS sıfır uydurulmaz; hesap sayısı gerçek workspace sayısıdır', async () => {
  const overview = await advertisingOverview(a);
  assert.equal(overview.totalAccounts, 1); assert.equal(overview.financialWritesEnabled, false);
  for (const value of Object.values(overview.metrics)) { assert.equal(value.value, null); assert.equal(value.availability, 'NOT_SYNCED'); }
  assert.equal((await advertisingOverview(b)).totalAccounts, 0);
});
it('filtre/sayfalama workspace sınırını değiştiremez', async () => {
  assert.equal((await listAdAccounts(a, new URLSearchParams({ provider: 'META', brand: brandA }))).total, 1);
  assert.equal((await listAdAccounts(a, new URLSearchParams({ brand: brandB }))).total, 0);
  await assert.rejects(listAdAccounts(a, new URLSearchParams({ provider: '__proto__' })), code('UNKNOWN_PROVIDER'));
  await assert.rejects(listAdAccounts(a, new URLSearchParams({ page: '-1' })), code('INVALID_INPUT'));
});
it('hiçbir finansal istek Job/Publication/organik token oluşturamaz veya değiştiremez', async () => {
  const before = { jobs: await prisma.job.count(), publications: await prisma.publication.count(), tokens: await prisma.socialProviderToken.findMany({ orderBy: { id: 'asc' } }) };
  const previous = process.env.FF_PAID_MEDIA_WRITE; process.env.FF_PAID_MEDIA_WRITE = 'true';
  try { for (const session of [a, viewer, editor]) await assert.rejects(requestFinancialOperation(session), code('PAID_MEDIA_WRITE_DISABLED')); }
  finally { if (previous === undefined) delete process.env.FF_PAID_MEDIA_WRITE; else process.env.FF_PAID_MEDIA_WRITE = previous; }
  assert.equal(await prisma.job.count(), before.jobs); assert.equal(await prisma.publication.count(), before.publications);
  assert.deepEqual(await prisma.socialProviderToken.findMany({ orderBy: { id: 'asc' } }), before.tokens);
});
it('bağlantı yokken OAuth başarı/taklit hesap oluşturulmaz', async () => {
  const before = await prisma.adAccount.count();
  await assert.rejects(requestAdvertisingConnection(a, 'META'), code('API_LIMITATION'));
  await assert.rejects(requestAdvertisingConnection({ ...a, sessionId: 'preview-demo' }, 'META'), code('PREVIEW_ONLY'));
  assert.equal(await prisma.adAccount.count(), before);
});
it('özellik kapatıldığında okuma, bağlama ve finansal endpoint servisleri kapanır', async () => {
  const previous = process.env.FF_PAID_MEDIA; process.env.FF_PAID_MEDIA = 'false';
  try { await assert.rejects(advertisingOverview(a), code('FEATURE_DISABLED')); await assert.rejects(requestFinancialOperation(a), code('FEATURE_DISABLED')); }
  finally { if (previous === undefined) delete process.env.FF_PAID_MEDIA; else process.env.FF_PAID_MEDIA = previous; }
});
it('süresi dolmuş reklam tokenı organik bağlantı durumunu değiştirmeden yeniden yetki ister', async () => {
  await prisma.adAccountCredential.update({ where: { adAccountId: accountId }, data: { expiresAt: new Date(0) } });
  const result = await getAdAccount(a, accountId);
  assert.equal(result.connectionStatus, 'REAUTH_REQUIRED'); assert.equal(result.health.oauth, 'NOT_VERIFIED');
});
it('composite foreign key tenant dışı marka ve credential ilişkilendirmesini engeller', async () => {
  await assert.rejects(prisma.adAccount.create({ data: { workspaceId: a.user.workspaceId, brandId: brandB, provider: 'META', providerAccountId: 'cross', displayName: 'cross' } }));
  await assert.rejects(prisma.adProviderCapability.create({ data: { workspaceId: b.user.workspaceId, adAccountId: accountId, version: 2 } }));
});
it('hata zarfı gizli provider metnini sızdırmaz; JSON boyutu sınırlıdır', async () => {
  const response = await advertisingResponse(async () => { throw new Error('secret-ad-token'); });
  assert.equal(response.status, 500); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.ok(!(await response.text()).includes('secret-ad-token'));
  await assert.rejects(advertisingBody(new Request('https://test.invalid', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(17000) }) })), code('TOO_LARGE'));
});
