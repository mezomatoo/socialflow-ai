import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import prisma from '../src/lib/prisma';
import { checkAccountHealth } from '../src/lib/social/accountHealth';
import { enqueue } from '../src/lib/queue/queue';
import { processJob } from '../src/lib/queue/handlers';

if (!process.env.DATABASE_URL?.endsWith('test.db')) throw new Error('Ayrı test.db gerekli.');

const tenants: string[] = [];
after(async () => {
  for (const id of tenants) await prisma.workspace.delete({ where: { id } });
  await prisma.$disconnect();
});

async function fixture(opts: { demo: boolean; withToken?: boolean; externalId?: string | null } = { demo: true }) {
  const workspace = await prisma.workspace.create({ data: { name: 'Health Test', slug: randomUUID() } });
  tenants.push(workspace.id);
  const account = await prisma.socialAccount.create({
    data: {
      workspaceId: workspace.id,
      platform: 'INSTAGRAM',
      handle: `health-${randomUUID().slice(0, 8)}`,
      displayName: 'Sağlık Hesabı',
      demoAccount: opts.demo,
      externalId: opts.externalId ?? null,
      connectionStatus: 'ACTIVE',
      ...(opts.withToken
        ? { token: { create: { accessTokenEnc: 'invalid-cipher', expiresAt: new Date(Date.now() + 3600_000) } } }
        : {})
    }
  });
  return { workspace, account };
}

describe('Hesap sağlığı (Faz 2 §27-§29)', () => {
  it('demo hesap sağlıklı çıkar ve yetenek/envanter güncellenir', async () => {
    const { account } = await fixture({ demo: true });
    const result = await checkAccountHealth(account.id);
    assert.equal(result.ok, true);
    assert.equal(result.connectionStatus, 'ACTIVE');
    const updated = await prisma.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
    assert.ok(updated.lastSyncedAt, 'lastSyncedAt güncellenmelidir');
    assert.ok(updated.capabilities.includes('contentTypes'), 'yetenek envanteri yazılmalıdır');
  });

  it('tokenı çözülemeyen gerçek hesap NEEDS_REAUTH olur ve hata denetimi başarısız sayılır', async () => {
    const { account } = await fixture({ demo: false, withToken: true });
    const result = await checkAccountHealth(account.id);
    assert.equal(result.ok, false);
    assert.equal(result.connectionStatus, 'NEEDS_REAUTH');
    const updated = await prisma.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
    assert.equal(updated.connectionStatus, 'NEEDS_REAUTH');
    assert.ok(updated.lastError, 'Türkçe hata mesajı yazılmalıdır');
    // Hesap SİLİNMEMELİ (§29)
    assert.ok(await prisma.socialAccount.findUnique({ where: { id: account.id } }));
  });

  it('kuyruktaki CheckSocialAccountHealthJob tek hesabı denetler', async () => {
    const { workspace, account } = await fixture({ demo: true });
    const { id } = await enqueue({
      type: 'CheckSocialAccountHealthJob',
      idempotencyKey: `health:test:${account.id}`,
      workspaceId: workspace.id,
      payload: { accountId: account.id }
    });
    const job = await prisma.job.findUniqueOrThrow({ where: { id: id! } });
    const result = await processJob(job);
    assert.equal((result as any).accountId, account.id);
    assert.equal((result as any).ok, true);
  });

  it('günlük bakım işleri idempotencyKey ile günde bir kez oluşur', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Önceki test koşularının aynı güne ait işlerini temizle (test.db kalıcı).
    await prisma.job.deleteMany({ where: { idempotencyKey: { in: [`health:daily:${today}`, `tokenrefresh:daily:${today}`] } } });
    const a = await enqueue({ type: 'CheckSocialAccountHealthJob', idempotencyKey: `health:daily:${today}`, payload: {} });
    const b = await enqueue({ type: 'CheckSocialAccountHealthJob', idempotencyKey: `health:daily:${today}`, payload: {} });
    assert.equal(a.created, true);
    assert.equal(b.created, false, 'aynı gün için ikinci iş OLUŞTURULMAMALI');
  });

  it('çalışma alanı izolasyonu: yabancı workspace sağlık denetimi kabul etmez', async () => {
    const { account } = await fixture({ demo: true });
    const foreign = await prisma.workspace.create({ data: { name: 'Yabancı', slug: randomUUID() } });
    tenants.push(foreign.id);
    await assert.rejects(
      checkAccountHealth(account.id, { workspaceId: foreign.id }),
      /Hesap bulunamadı/
    );
  });
});
