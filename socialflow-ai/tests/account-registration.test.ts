import { it, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import prisma from '../src/lib/prisma';
import { registerAccount, AccountRegistrationError } from '../src/lib/services/accountRegistrationService';
import type { SessionContext } from '../src/lib/auth/session';
if (!process.env.DATABASE_URL?.endsWith('test.db')) throw new Error('Ayrı test.db gerekli.');
const tenants: string[] = [];
async function fixture(demoMode = false) {
  const workspace = await prisma.workspace.create({ data: { name: 'Registration Test', slug: randomUUID(), demoMode } }); tenants.push(workspace.id);
  const user = await prisma.user.create({ data: { workspaceId: workspace.id, name: 'Test', email: `${randomUUID()}@test.invalid`, passwordHash: 'no-login', role: 'OWNER' } });
  return { user: { ...user, role: 'OWNER',
        membershipId: 'membership-1',
        membershipStatus: 'ACTIVE', workspaceName: workspace.name, workspaceSlug: workspace.slug, demoMode }, sessionId: 'test-session', csrfToken: 'test' } as SessionContext;
}
after(async () => { for (const id of tenants) await prisma.workspace.delete({ where: { id } }); await prisma.$disconnect(); });
it('gerçek hesap OAuth öncesi bağlı gösterilmez; istemci token/izin/kimlik iddiası yok sayılır', async () => {
  const session = await fixture();
  const result = await registerAccount(session, { platform: 'INSTAGRAM', handle: 'User.Name', demoAccount: true, scopes: ['instagram_manage_comments'], externalId: 'spoofed', connectionStatus: 'ACTIVE' });
  assert.equal(result.connectionStatus, 'NEEDS_REAUTH'); assert.equal(result.demoAccount, false); assert.equal(result.handle, '@user.name');
  const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: result.id }, include: { token: true } });
  assert.equal(account.scopes, ''); assert.equal(account.externalId, null); assert.equal(account.token, null);
});
it('demo workspace gerçek hesap işaretini istemciden kabul etmez', async () => {
  const session = await fixture(true);
  const result = await registerAccount(session, { platform: 'INSTAGRAM', handle: 'demo', demoAccount: false });
  assert.equal(result.demoAccount, true); assert.equal(result.connectionStatus, 'ACTIVE');
});
it('tenant dışı marka, yetkisiz rol ve geçersiz platform reddedilir', async () => {
  const a = await fixture(), b = await fixture();
  const brand = await prisma.brand.create({ data: { workspaceId: b.user.workspaceId, name: 'Private', slug: 'private' } });
  await assert.rejects(registerAccount(a, { platform: 'INSTAGRAM', handle: 'test', brandId: brand.id }), e => e instanceof AccountRegistrationError && e.status === 404);
  await assert.rejects(registerAccount(a, { platform: 'UNKNOWN', handle: 'test' }), AccountRegistrationError);
  await prisma.user.update({ where: { id: a.user.id }, data: { role: 'VIEWER' } });
  await assert.rejects(registerAccount(a, { platform: 'INSTAGRAM', handle: 'test' }), e => e instanceof AccountRegistrationError && e.status === 403);
  assert.equal(await prisma.socialAccount.count({ where: { workspaceId: a.user.workspaceId } }), 0);
});
it('aynı Instagram handle büyük/küçük harf ve @ farkıyla tekrar oluşturulmaz', async () => {
  const session = await fixture();
  await registerAccount(session, { platform: 'INSTAGRAM', handle: 'User.Name' });
  await assert.rejects(registerAccount(session, { platform: 'INSTAGRAM', handle: '@user.name' }), e => e instanceof AccountRegistrationError && e.status === 409);
});
