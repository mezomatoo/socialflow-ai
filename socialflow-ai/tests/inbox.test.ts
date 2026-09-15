import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'crypto';
import prisma from '../src/lib/prisma';
import type { SessionContext } from '../src/lib/auth/session';
import { getConversation, inboxOptions, listConversations, processInboxEvent, queueManualInteraction, updateConversation } from '../src/lib/inbox/service';
import { InboxError } from '../src/lib/inbox/contracts';
import { verifyWebhookSignature, validWebhookTimestamp } from '../src/lib/inbox/webhookSecurity';
import { getProvider } from '../src/lib/social/registry';
import { processJob } from '../src/lib/queue/handlers';
import { inboxBody, inboxResponse } from '../src/lib/inbox/route';

type Actor = SessionContext['user'];
// Explicit guard: never run these fixtures against the user's application database.
if (!process.env.DATABASE_URL?.endsWith('test.db')) throw new Error('Yalnızca ayrı test.db üzerinde çalıştırın.');
const tenants: string[] = [];
let a: Actor, b: Actor, viewer: Actor, accountA: string, accountB: string, conversation: string;
function rejectsCode(code: string) { return (e: unknown) => e instanceof InboxError && e.code === code; }
async function tenant(suffix: string) {
  const workspace = await prisma.workspace.create({ data: { name: `Inbox test ${suffix}`, slug: `inbox-${suffix}-${randomUUID()}` } });
  tenants.push(workspace.id);
  const user = await prisma.user.create({ data: { workspaceId: workspace.id, name: `Üye ${suffix}`, email: `${randomUUID()}@test.invalid`, passwordHash: 'not-a-login', role: 'OWNER' } });
  const brand = await prisma.brand.create({ data: { workspaceId: workspace.id, name: 'Test Marka', slug: 'test' } });
  const account = await prisma.socialAccount.create({ data: { workspaceId: workspace.id, brandId: brand.id, platform: 'INSTAGRAM', handle: `@test-${suffix}`, displayName: 'Test Hesap' } });
  const actor: Actor = { id: user.id, workspaceId: workspace.id, role: 'OWNER',
        membershipId: 'membership-1',
        membershipStatus: 'ACTIVE', name: user.name, email: user.email, avatarUrl: null, workspaceName: workspace.name, workspaceSlug: workspace.slug, demoMode: true, timezone: 'Europe/Istanbul', locale: 'tr' };
  return { actor, account };
}
describe('Faz 5 — Gelen Kutusu güvenlik ve iş akışı', () => {
  before(async () => {
    const first = await tenant('a'), second = await tenant('b');
    a = first.actor; b = second.actor; accountA = first.account.id; accountB = second.account.id;
    const u = await prisma.user.create({ data: { workspaceId: a.workspaceId, email: `${randomUUID()}@test.invalid`, name: 'Görüntüleyici', passwordHash: 'not-a-login', role: 'VIEWER' } });
    viewer = { ...a, id: u.id, role: 'VIEWER' };
  });
  after(async () => {
    // Delete only this suite's uniquely-created tenants, child-first due to retention-safe FKs.
    for (const workspaceId of tenants) {
      await prisma.socialMessage.deleteMany({ where: { workspaceId } });
      await prisma.conversationAssignment.deleteMany({ where: { workspaceId } });
      await prisma.conversationTag.deleteMany({ where: { workspaceId } });
      await prisma.socialConversation.deleteMany({ where: { workspaceId } });
      await prisma.socialParticipant.deleteMany({ where: { workspaceId } });
      await prisma.inboxEvent.deleteMany({ where: { workspaceId } });
      await prisma.workspace.delete({ where: { id: workspaceId } });
    }
    await prisma.$disconnect();
  });
  it('elle giriş → mevcut Job kuyruğu → normalize konuşma/mesaj/katılımcı', async () => {
    const event = await queueManualInteraction(a, { socialAccountId: accountA, name: 'Müşteri', text: 'Ürünün fiyatını öğrenebilir miyim?', type: 'COMMENT', eventKey: randomUUID() });
    const job = await prisma.job.findUniqueOrThrow({ where: { idempotencyKey: `inbox:${event.id}` } });
    assert.equal(job.type, 'InboxEventJob');
    const result = await processJob(job);
    conversation = result!.conversationId as string;
    const detail = await getConversation(a, conversation);
    assert.equal(detail.source, 'MANUAL'); assert.equal(detail.provider, 'INSTAGRAM');
    assert.equal(detail.messages.length, 1); assert.equal(detail.messages[0].direction, 'INBOUND');
    assert.equal(detail._count.messages, 1); assert.equal(detail.status, 'NEW');
    assert.equal((await prisma.inboxEvent.findUniqueOrThrow({ where: { id: event.id } })).payload, '{}');
  });
  it('aynı istek/olay tekrarında çift konuşma ve çift bildirim oluşturmaz', async () => {
    const body = { socialAccountId: accountA, name: 'Müşteri', text: 'Merhaba', type: 'DIRECT_MESSAGE', eventKey: randomUUID() };
    const first = await queueManualInteraction(a, body), retry = await queueManualInteraction(a, body);
    assert.equal(first.id, retry.id);
    const result = await processInboxEvent(a.workspaceId, first.id);
    const notifications = await prisma.notification.count({ where: { workspaceId: a.workspaceId } });
    assert.deepEqual(await processInboxEvent(a.workspaceId, retry.id), { conversationId: result.conversationId, duplicate: true });
    assert.equal(await prisma.notification.count({ where: { workspaceId: a.workspaceId } }), notifications);
    assert.equal((await queueManualInteraction(a, body)).conversationId, result.conversationId);
    await assert.rejects(queueManualInteraction(a, { ...body, text: 'Farklı veri' }), rejectsCode('CONFLICT'));
  });
  it('aynı görünen isim kimlikleri otomatik birleştirmez', async () => {
    assert.equal(await prisma.socialParticipant.count({ where: { workspaceId: a.workspaceId, displayName: 'Müşteri' } }), 2);
  });
  it('tenant dışı okuma/yazma ve var olmayan kayıt aynı 404 hatasını verir', async () => {
    await assert.rejects(getConversation(b, conversation), rejectsCode('NOT_FOUND'));
    await assert.rejects(getConversation(b, 'does-not-exist'), rejectsCode('NOT_FOUND'));
    await assert.rejects(updateConversation(b, conversation, { version: 1, action: 'status', value: 'RESOLVED' }), rejectsCode('NOT_FOUND'));
    const result = await listConversations(b, new URLSearchParams({ q: 'Müşteri' })); assert.equal(result.total, 0);
    await assert.rejects(queueManualInteraction(a, { socialAccountId: accountB, name: 'x', text: 'x', type: 'COMMENT', eventKey: randomUUID() }), rejectsCode('NOT_FOUND'));
  });
  it('event worker da workspace eşleştirmesini zorunlu tutar', async () => {
    const event = await prisma.inboxEvent.findFirstOrThrow({ where: { workspaceId: a.workspaceId } });
    await assert.rejects(processInboxEvent(b.workspaceId, event.id), rejectsCode('NOT_FOUND'));
  });
  it('VIEWER okuyabilir ama role spoof ederek yazamaz', async () => {
    await getConversation(viewer, conversation);
    await assert.rejects(updateConversation({ ...viewer, role: 'OWNER' }, conversation, { version: 1, action: 'read' }), rejectsCode('FORBIDDEN'));
    await assert.rejects(queueManualInteraction(viewer, { }), rejectsCode('FORBIDDEN'));
    assert.equal((await inboxOptions(viewer)).canManage, false);
  });
  it('atama, bildirim, audit ve sürüm tek işlemde güncellenir', async () => {
    const c = await getConversation(a, conversation);
    await updateConversation(a, conversation, { version: c.version, action: 'assign', value: viewer.id });
    const next = await getConversation(a, conversation);
    assert.equal(next.assignedTo, viewer.id); assert.equal(next.assignments.length, 1); assert.equal(next.version, c.version + 1);
    assert.ok(await prisma.notification.findFirst({ where: { userId: viewer.id, type: 'INBOX' } }));
    assert.ok(await prisma.auditLog.findFirst({ where: { entityId: conversation, action: 'conversation.assign' } }));
    await assert.rejects(updateConversation(a, conversation, { version: c.version, action: 'assign', value: a.id }), rejectsCode('CONFLICT'));
    await assert.rejects(updateConversation(a, conversation, { version: next.version, action: 'assign', value: b.id }), rejectsCode('NOT_FOUND'));
    assert.equal((await getConversation(a, conversation)).assignments.length, 1);
  });
  it('iç not müşteriye gönderilmez; @üye bildirimi tenant kapsamında ve PII içermez', async () => {
    const c = await getConversation(a, conversation);
    const jobs = await prisma.job.count({ where: { workspaceId: a.workspaceId } });
    await updateConversation(a, conversation, { version: c.version, action: 'note', value: 'Özel bilgi: 0555 111 22 33 @Üye', mentionUserIds: [viewer.id] });
    const next = await getConversation(a, conversation);
    assert.equal(next.messages.at(-1)?.direction, 'INTERNAL');
    assert.equal(next.messages.filter(m => m.direction === 'OUTBOUND').length, 0);
    assert.equal(next.lastMessageAt.getTime(), c.lastMessageAt.getTime());
    assert.equal(await prisma.job.count({ where: { workspaceId: a.workspaceId } }), jobs);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: conversation, action: 'conversation.note' } });
    assert.ok(!JSON.stringify(audit).includes('0555'));
    const notifications = await prisma.notification.findMany({ where: { workspaceId: a.workspaceId } });
    assert.ok(!JSON.stringify(notifications).includes('0555'));
    await assert.rejects(updateConversation(a, conversation, { version: next.version, action: 'note', value: 'gizli', mentionUserIds: [b.id] }), rejectsCode('NOT_FOUND'));
  });
  it('desteklenmeyen yanıt API çağrısı 422; hayalî dış mesaj veya başarı kaydı yok', async () => {
    const c = await getConversation(a, conversation);
    await assert.rejects(updateConversation(a, conversation, { version: c.version, action: 'reply', value: 'Merhaba' }), rejectsCode('API_LIMITATION'));
    assert.equal((await getConversation(a, conversation)).version, c.version);
    for (const platform of ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'THREADS', 'PINTEREST', 'GOOGLE_BUSINESS']) {
      const capabilities = getProvider(platform).getEngagementCapabilities();
      assert.equal(capabilities.supportsDM, false); assert.equal(capabilities.supportsCommentReply, false);
      assert.equal(capabilities.supportsWebhooks, false);
    }
  });
  it('etiket / öncelik / okunma / çözüm / yeniden açma çalışır', async () => {
    for (const [action, value] of [['tag', 'Satış'], ['priority', 'URGENT'], ['read', null], ['status', 'RESOLVED']] as const) {
      const c = await getConversation(a, conversation);
      await updateConversation(a, conversation, { action, value, version: c.version });
    }
    const c = await getConversation(a, conversation);
    assert.equal(c.priority, 'URGENT'); assert.equal(c._count.messages, 0); assert.ok(c.resolvedAt); assert.equal(c.tags[0].name, 'Satış');
    const filtered = await listConversations(a, new URLSearchParams({ q: 'Satış', status: 'RESOLVED', priority: 'URGENT', assigned: viewer.id }));
    assert.equal(filtered.total, 1);
    assert.equal((await listConversations(a, new URLSearchParams({ status: 'RESOLVED', unread: 'true' }))).total, 0);
    await updateConversation(a, conversation, { action: 'status', value: 'OPEN', version: c.version });
    assert.equal((await getConversation(a, conversation)).resolvedAt, null);
  });
  it('veritabanı birleşik foreign key ile tenant dışı mesaj eklemeyi reddeder', async () => {
    await assert.rejects(prisma.socialMessage.create({ data: { workspaceId: b.workspaceId, conversationId: conversation, providerMessageId: randomUUID(), direction: 'INBOUND', sender: 'test', text: 'test', sentAt: new Date() } }));
    assert.equal(await prisma.socialMessage.count({ where: { workspaceId: b.workspaceId } }), 0);
  });
  it('yayınlama ve token kayıtlarına gelen kutusu işlemleri dokunmaz', async () => {
    const before = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountA }, include: { token: true } });
    const publications = await prisma.publication.count();
    const c = await getConversation(a, conversation);
    await updateConversation(a, conversation, { action: 'priority', value: 'NORMAL', version: c.version });
    assert.deepEqual(await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountA }, include: { token: true } }), before);
    assert.equal(await prisma.publication.count(), publications);
  });
  it('geçersiz enum ve prototip anahtarları reddedilir', async () => {
    const c = await getConversation(a, conversation);
    for (const value of ['__proto__', 'INVALID', 7]) await assert.rejects(updateConversation(a, conversation, { version: c.version, action: 'status', value }), rejectsCode('INVALID_INPUT'));
  });
  it('özellik kapalıysa UI servis okuma ve mutasyonları kapalıdır', async () => {
    const previous = process.env.FF_UNIFIED_INBOX;
    process.env.FF_UNIFIED_INBOX = 'false';
    try {
      await assert.rejects(getConversation(a, conversation), rejectsCode('FEATURE_DISABLED'));
      await assert.rejects(queueManualInteraction(a, {}), rejectsCode('FEATURE_DISABLED'));
    } finally { if (previous === undefined) delete process.env.FF_UNIFIED_INBOX; else process.env.FF_UNIFIED_INBOX = previous; }
  });
  it('webhook HMAC ham byte gövdesini doğrular; yanlış imza ve zamanı reddeder', () => {
    const raw = Buffer.from('{"text":"merhaba"}'); const secret = 'test-only-secret';
    const signature = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    assert.equal(verifyWebhookSignature(raw, signature, secret), true);
    assert.equal(verifyWebhookSignature(Buffer.from('{}'), signature, secret), false);
    assert.equal(verifyWebhookSignature(raw, signature, ''), false);
    assert.equal(verifyWebhookSignature(raw, 'sha256=bad', secret), false);
    assert.equal(validWebhookTimestamp(Date.now() / 1000), true);
    assert.equal(validWebhookTimestamp((Date.now() - 37 * 3600_000) / 1000), false);
    assert.equal(validWebhookTimestamp((Date.now() + 600_000) / 1000), false);
    assert.equal(validWebhookTimestamp('123'), false);
  });
  it('API gövde sınırı ve güvenli hata zarfı', async () => {
    await assert.rejects(inboxBody(new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(33000) }) })), rejectsCode('TOO_LARGE'));
    const response = await inboxResponse(async () => { throw new Error('token=secret, PII'); });
    assert.equal(response.status, 500); assert.ok(!(await response.text()).includes('secret'));
  });
});
