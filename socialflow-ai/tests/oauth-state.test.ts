import { it, after } from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthState, consumeOAuthState } from '../src/lib/social/oauth2';
import prisma from '../src/lib/prisma';
import { randomUUID } from 'crypto';
if (!process.env.DATABASE_URL?.endsWith('test.db')) throw new Error('Ayrı test.db gerekli.');
const binding = { platform: 'INSTAGRAM', userId: randomUUID(), workspaceId: randomUUID() };
after(async () => { await prisma.oAuthState.deleteMany({ where: { workspaceId: binding.workspaceId } }); await prisma.$disconnect(); });
it('OAuth state aynı anda yalnızca bir kez tüketilir', async () => {
  const value = await createOAuthState(binding);
  const results = await Promise.all(Array.from({ length: 8 }, () => consumeOAuthState(value.state, binding)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.find(Boolean)?.codeVerifier, value.codeVerifier);
  const stored = await prisma.oAuthState.findUniqueOrThrow({ where: { state: value.state } });
  assert.equal(stored.codeVerifier, null);
  assert.equal(await consumeOAuthState(value.state, binding), null);
});
it('yanlış kullanıcı/workspace/platform state tüketmez', async () => {
  const value = await createOAuthState(binding);
  for (const altered of [{ userId: 'other' }, { workspaceId: 'other' }, { platform: 'FACEBOOK' }]) {
    assert.equal(await consumeOAuthState(value.state, { ...binding, ...altered }), null);
  }
  assert.ok(await consumeOAuthState(value.state, binding));
});
it('süresi dolmuş, eksik ve çok uzun state reddedilir', async () => {
  const value = await createOAuthState({ ...binding, ttlSeconds: -1 });
  assert.equal(await consumeOAuthState(value.state, binding), null);
  assert.equal(await consumeOAuthState('', binding), null);
  assert.equal(await consumeOAuthState('x'.repeat(201), binding), null);
  assert.equal(await consumeOAuthState('not-found', binding), null);
});
