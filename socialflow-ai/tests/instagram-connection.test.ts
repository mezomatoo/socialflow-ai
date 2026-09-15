import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import prisma from '../src/lib/prisma';
import { beginInstagramConnection, completeInstagramConnection } from '../src/lib/social/instagramConnection';
import { InstagramConnectionError } from '../src/lib/social/instagramConnectionMessages';
import { InstagramProvider, INSTAGRAM_PUBLISH_SCOPES } from '../src/lib/social/providers/InstagramProvider';
import { toCipherText, fromCipherText } from '../src/lib/crypto';
import type { SessionContext } from '../src/lib/auth/session';
if (!process.env.DATABASE_URL?.endsWith('test.db')) throw new Error('Ayrı test.db gerekli.');
const tenants: string[] = [];
const codeIs = (code: string) => (e: unknown) => e instanceof InstagramConnectionError && e.code === code;
async function fixture() {
  const workspace = await prisma.workspace.create({ data: { name: 'OAuth Test', slug: randomUUID(), demoMode: false } });
  tenants.push(workspace.id);
  const user = await prisma.user.create({ data: { workspaceId: workspace.id, name: 'Test', email: `${randomUUID()}@test.invalid`, passwordHash: 'no-login', role: 'OWNER' } });
  const account = await prisma.socialAccount.create({ data: { workspaceId: workspace.id, platform: 'INSTAGRAM', externalId: 'verified-ig-id', handle: '@verified', displayName: 'Verified', demoAccount: false, scopes: INSTAGRAM_PUBLISH_SCOPES.join(',') } });
  await prisma.socialProviderToken.create({ data: { socialAccountId: account.id, accessTokenEnc: toCipherText('old-test-token'), scope: INSTAGRAM_PUBLISH_SCOPES.join(',') } });
  const session: SessionContext = { sessionId: 'real-test-session', csrfToken: 'test', user: { id: user.id, workspaceId: workspace.id, role: 'OWNER',
        membershipId: 'membership-1',
        membershipStatus: 'ACTIVE', name: user.name, email: user.email, avatarUrl: null, workspaceName: workspace.name, workspaceSlug: workspace.slug, demoMode: false, timezone: 'Europe/Istanbul', locale: 'tr' } };
  let exchanges = 0;
  const adapter = {
    getAuthorizationUrl(p: { state: string; redirectUri: string; scopes?: string[] }) { return `https://www.facebook.com/dialog/oauth?${new URLSearchParams({ state: p.state, redirect_uri: p.redirectUri, scope: p.scopes!.join(',') })}`; },
    async exchangeCode() { exchanges++; return { accessToken: 'new-test-token', expiresIn: 3600 }; },
    async fetchGrantedPermissions() { return [...INSTAGRAM_PUBLISH_SCOPES]; },
    async fetchAccountProfiles() { return [{ externalId: 'verified-ig-id', handle: '@verified', displayName: 'Verified New', accountType: 'BUSINESS' }]; }
  };
  const begin = async () => new URL((await beginInstagramConnection(session, account.id, adapter)).authorizeUrl).searchParams.get('state')!;
  const token = () => prisma.socialProviderToken.findUniqueOrThrow({ where: { socialAccountId: account.id } });
  return { workspace, user, account, session, adapter, begin, token, exchanges: () => exchanges };
}
after(async () => {
  for (const workspaceId of tenants) {
    await prisma.oAuthState.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
  }
  await prisma.$disconnect();
});
it('bağlantı başlangıcı hesabı, kullanıcıyı ve HTTPS redirect URIyi state içine bağlar', async () => {
  const f = await fixture(); const state = await f.begin();
  const row = await prisma.oAuthState.findUniqueOrThrow({ where: { state } });
  assert.equal(row.socialAccountId, f.account.id); assert.equal(row.userId, f.user.id);
  assert.equal(row.workspaceId, f.workspace.id); assert.equal(row.redirectUri, 'https://oauth-test.invalid/api/auth/instagram/callback');
  assert.equal(row.accountUpdatedAt?.getTime(), f.account.updatedAt.getTime());
  assert.equal(fromCipherText((await f.token()).accessTokenEnc), 'old-test-token');
});
it('doğrulanmış doğru hesap ve izinler şifreli tokenı atomik günceller', async () => {
  const f = await fixture(); const state = await f.begin();
  const publications = await prisma.publication.count();
  await completeInstagramConnection(f.session, { state, code: 'test-code' }, f.adapter);
  const stored = await f.token();
  assert.equal(fromCipherText(stored.accessTokenEnc), 'new-test-token');
  assert.ok(!stored.accessTokenEnc.includes('new-test-token')); assert.ok(stored.expiresAt);
  const logs = await prisma.auditLog.findMany({ where: { workspaceId: f.workspace.id } });
  assert.ok(logs.some(l => l.action === 'account.connect.completed'));
  assert.ok(!JSON.stringify(logs).includes('test-token')); assert.ok(!JSON.stringify(logs).includes(state));
  assert.equal(await prisma.publication.count(), publications);
  await assert.rejects(completeInstagramConnection(f.session, { state, code: 'test-code' }, f.adapter), codeIs('invalid_state'));
  assert.equal(f.exchanges(), 1);
});
it('yanlış oturum/workspace state tüketmez ve provider çağrısı yapmaz', async () => {
  const a = await fixture(), b = await fixture(); const state = await a.begin();
  await assert.rejects(completeInstagramConnection(b.session, { state, code: 'test' }, a.adapter), codeIs('invalid_state'));
  assert.equal(a.exchanges(), 0);
  assert.equal((await prisma.oAuthState.findUniqueOrThrow({ where: { state } })).consumedAt, null);
  await assert.rejects(beginInstagramConnection(b.session, a.account.id, b.adapter), codeIs('not_found'));
});
it('yanlış Instagram hesabı mevcut tokena veya hesap kaydına dokunmaz', async () => {
  const f = await fixture(); const oldToken = await f.token(); const state = await f.begin();
  f.adapter.fetchAccountProfiles = async () => [{ externalId: 'other', handle: '@other', displayName: 'Other', accountType: 'BUSINESS' }];
  await assert.rejects(completeInstagramConnection(f.session, { state, code: 'test' }, f.adapter), codeIs('account_mismatch'));
  assert.deepEqual(await f.token(), oldToken);
  assert.deepEqual(await prisma.socialAccount.findUnique({ where: { id: f.account.id } }), f.account);
});
it('eksik izin ve daha önce var olan izin kaybı eski tokenı korur', async () => {
  const f = await fixture();
  await prisma.socialProviderToken.update({ where: { socialAccountId: f.account.id }, data: { scope: [...INSTAGRAM_PUBLISH_SCOPES, 'instagram_manage_comments'].join(' ') } });
  const oldToken = await f.token();
  const state = await f.begin();
  await assert.rejects(completeInstagramConnection(f.session, { state, code: 'test' }, f.adapter), codeIs('permissions'));
  assert.deepEqual(await f.token(), oldToken);
});
it('Meta reddi state tüketir, token değiştirmez ve provider çağırmaz', async () => {
  const f = await fixture(); const oldToken = await f.token(); const state = await f.begin();
  await assert.rejects(completeInstagramConnection(f.session, { state, denied: true }, f.adapter), codeIs('denied'));
  assert.deepEqual(await f.token(), oldToken); assert.equal(f.exchanges(), 0);
  assert.ok((await prisma.oAuthState.findUniqueOrThrow({ where: { state } })).consumedAt);
});
it('provider hatası, token/code içeren ham mesajı dışarı taşımaz', async () => {
  const f = await fixture(); const oldToken = await f.token(); const state = await f.begin();
  f.adapter.exchangeCode = async () => { throw new Error('SECRET_PROVIDER_TOKEN=should-not-leak'); };
  await assert.rejects(completeInstagramConnection(f.session, { state, code: 'test' }, f.adapter), e => e instanceof InstagramConnectionError && e.code === 'provider_error' && !e.message.includes('SECRET'));
  assert.deepEqual(await f.token(), oldToken);
});
it('OAuth beklerken bağlantı kesilirse callback hesabı yeniden etkinleştirmez', async () => {
  const f = await fixture(); const oldToken = await f.token(); const state = await f.begin();
  await prisma.socialAccount.update({ where: { id: f.account.id }, data: { connectionStatus: 'REVOKED', updatedAt: new Date(f.account.updatedAt.getTime() + 1000) } });
  await assert.rejects(completeInstagramConnection(f.session, { state, code: 'test' }, f.adapter), codeIs('stale_account'));
  assert.equal(f.exchanges(), 0); assert.deepEqual(await f.token(), oldToken);
});
it('provider çağrısı sırasında değişiklik olursa transaction son kontrolü reddeder', async () => {
  const f = await fixture(); const oldToken = await f.token(); const state = await f.begin();
  f.adapter.fetchGrantedPermissions = async () => {
    await prisma.socialAccount.update({ where: { id: f.account.id }, data: { updatedAt: new Date(f.account.updatedAt.getTime() + 1000) } });
    return [...INSTAGRAM_PUBLISH_SCOPES];
  };
  await assert.rejects(completeInstagramConnection(f.session, { state, code: 'test' }, f.adapter), codeIs('stale_account'));
  assert.deepEqual(await f.token(), oldToken);
});
it('VIEWER rolü, pasif kullanıcı ve otomatik preview oturumu canlı OAuth kullanamaz', async () => {
  const f = await fixture();
  await assert.rejects(beginInstagramConnection({ ...f.session, sessionId: 'preview-demo' }, f.account.id, f.adapter), codeIs('forbidden'));
  await prisma.user.update({ where: { id: f.user.id }, data: { role: 'VIEWER' } });
  await assert.rejects(f.begin(), codeIs('forbidden'));
  await prisma.user.update({ where: { id: f.user.id }, data: { role: 'OWNER', isActive: false } });
  await assert.rejects(f.begin(), codeIs('forbidden'));
});
it('demo workspace canlı bağlantı yapamaz', async () => {
  const f = await fixture(); await prisma.workspace.update({ where: { id: f.workspace.id }, data: { demoMode: true } });
  await assert.rejects(f.begin(), codeIs('configuration'));
});
it('boş token ve kısa/negatif ömür kabul edilmez', async () => {
  const f = await fixture(); const oldToken = await f.token();
  for (const result of [{ accessToken: '', expiresIn: 3600 }, { accessToken: 'x', expiresIn: -1 }, { accessToken: 'x', expiresIn: 30 }]) {
    const state = await f.begin(); f.adapter.exchangeCode = async () => result;
    await assert.rejects(completeInstagramConnection(f.session, { state, code: 'test' }, f.adapter), codeIs('provider_error'));
  }
  assert.deepEqual(await f.token(), oldToken);
});
it('demo kapsamları gerçek izin gibi istenmez; demo hesap doğrulanmış profile dönüşebilir', async () => {
  const f = await fixture();
  await prisma.socialAccount.update({ where: { id: f.account.id }, data: { demoAccount: true, externalId: 'demo-id', scopes: 'demo_scopes' } });
  await prisma.socialProviderToken.update({ where: { socialAccountId: f.account.id }, data: { scope: 'demo_scopes' } });
  const state = await f.begin();
  await completeInstagramConnection(f.session, { state, code: 'test' }, f.adapter);
  const current = await prisma.socialAccount.findUniqueOrThrow({ where: { id: f.account.id } });
  assert.equal(current.demoAccount, false); assert.equal(current.externalId, 'verified-ig-id');
  assert.ok(!current.scopes.includes('demo_scopes'));
});
it('Meta permission durumları filtrelenir, pagination next URL takip edilmez', async () => {
  const saved = globalThis.fetch; const urls: string[] = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url)); assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer permission-test');
    return Response.json(urls.length === 1 ? { data: [{ permission: 'instagram_basic', status: 'granted' }, { permission: 'denied_permission', status: 'declined' }], paging: { next: 'https://untrusted.invalid/?access_token=bad', cursors: { after: 'cursor-two' } } } : { data: [{ permission: 'instagram_content_publish', status: 'granted' }, { permission: 'expired', status: 'expired' }] });
  };
  try {
    const granted = await new InstagramProvider().fetchGrantedPermissions('permission-test');
    assert.deepEqual(granted, ['instagram_basic', 'instagram_content_publish']);
    assert.equal(urls.length, 2); assert.ok(urls.every(u => new URL(u).origin === 'https://graph.facebook.com'));
    assert.equal(new URL(urls[1]).searchParams.get('after'), 'cursor-two');
    assert.ok(urls.every(u => !u.includes('access_token')));
  } finally { globalThis.fetch = saved; }
});
