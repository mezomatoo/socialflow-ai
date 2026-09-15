// Run against a dedicated test.db server with PREVIEW_AUTOLOGIN=false.
// Example: INBOX_TEST_URL=http://localhost:3001 node tests/inbox-http.mjs
import assert from 'node:assert/strict';
const base = process.env.INBOX_TEST_URL;
if (!base) throw new Error('INBOX_TEST_URL gerekli; yalnızca test veritabanı sunucusu kullanın.');
const call = (path, init) => fetch(new URL(path, base), { redirect: 'manual', ...init });
assert.equal((await call('/api/inbox')).status, 401);
assert.equal((await call('/api/inbox/options')).status, 401);
assert.equal((await call('/api/inbox/no-such-id')).status, 401);
const page = await call('/app/gelen-kutusu');
assert.ok([302, 303, 307, 308].includes(page.status));
assert.ok(page.headers.get('location').includes('/giris'));
const login = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@socialflow.ai', password: 'Sosyal2026!' }) });
assert.equal(login.status, 200);
const cookies = login.headers.getSetCookie().map(c => c.split(';')[0]);
const cookie = cookies.join('; ');
const csrf = decodeURIComponent(cookies.find(c => c.startsWith('sf_csrf=')).slice(8));
assert.equal((await call('/api/inbox', { headers: { cookie } })).status, 200);
assert.equal((await call('/api/inbox', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' })).status, 403);
assert.equal((await call('/api/inbox', { method: 'POST', headers: { cookie: cookie.replace(/sf_csrf=[^;]+/, 'sf_csrf=forged'), 'x-csrf-token': 'forged', 'content-type': 'application/json' }, body: '{}' })).status, 403);
assert.equal((await call('/api/inbox/no-such-id', { method: 'PATCH', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, action: 'reply', value: 'test' }) })).status, 404);
assert.equal((await call('/api/inbox', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: '{' })).status, 400);
assert.equal((await call('/api/auth/logout', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf } })).status, 200);
assert.equal((await call('/api/inbox', { headers: { cookie } })).status, 401);
console.log('HTTP: oturumsuz erişim, giriş/çıkış, CSRF yok/uydurma, geçersiz JSON ve 404 kontrolleri başarılı.');
