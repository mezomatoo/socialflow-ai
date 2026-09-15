import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'crypto';
import prisma from '../src/lib/prisma';
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
  listSubscriptions,
  dispatchOutboundWebhook,
  executeWebhookDelivery,
  retryDeadLetterDelivery,
  signWebhookPayload
} from '../src/lib/webhooks/outbound';

if (!process.env.DATABASE_URL?.endsWith('test.db')) {
  throw new Error('Yalnızca ayrı test.db üzerinde çalıştırın.');
}

describe('② Çıkış Webhook\'ları (§93) — İmzalı Payload + Retry / Dead-Letter', { concurrency: 1 }, () => {
  let workspaceAId: string;
  let workspaceBId: string;
  const originalFlag = process.env.FF_OUTGOING_WEBHOOKS;

  before(async () => {
    process.env.FF_OUTGOING_WEBHOOKS = 'true';

    const wsA = await prisma.workspace.create({
      data: { name: 'Tenant A', slug: `ws-a-${randomUUID()}` }
    });
    workspaceAId = wsA.id;

    const wsB = await prisma.workspace.create({
      data: { name: 'Tenant B', slug: `ws-b-${randomUUID()}` }
    });
    workspaceBId = wsB.id;
  });

  beforeEach(async () => {
    // Her test öncesi temiz bir durum sağla
    await prisma.webhookDelivery.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId] } }
    });
    await prisma.webhookSubscription.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId] } }
    });
  });

  after(async () => {
    if (originalFlag === undefined) delete process.env.FF_OUTGOING_WEBHOOKS;
    else process.env.FF_OUTGOING_WEBHOOKS = originalFlag;

    await prisma.webhookDelivery.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId] } }
    });
    await prisma.webhookSubscription.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceBId] } }
    });
    await prisma.workspace.deleteMany({
      where: { id: { in: [workspaceAId, workspaceBId] } }
    });
  });

  it('abonelik oluşturma, güncelleme, silme ve tenant izolasyonu', async () => {
    const subA = await createSubscription(workspaceAId, {
      url: 'https://example.com/webhook',
      events: ['content.published', 'inbox.message'],
      description: 'Müşteri CRM Entegrasyonu'
    });

    assert.ok(subA.id);
    assert.equal(subA.isActive, true);
    assert.equal(subA.url, 'https://example.com/webhook');
    assert.ok(subA.secret.startsWith('whsec_'));

    // Listeleme: yalnızca A kiracısının abonelikleri döner
    const listA = await listSubscriptions(workspaceAId);
    assert.equal(listA.length, 1);
    assert.equal(listA[0].id, subA.id);

    const listB = await listSubscriptions(workspaceBId);
    assert.equal(listB.length, 0);

    // Güncelleme
    const updated = await updateSubscription(workspaceAId, subA.id, {
      description: 'Güncellenmiş Açıklama',
      events: ['*']
    });
    assert.equal(updated.description, 'Güncellenmiş Açıklama');
    assert.deepEqual(JSON.parse(updated.events), ['*']);

    // Tenant izolasyonu: Tenant B, Tenant A'nın aboneliğini güncelleyemez/silemez
    await assert.rejects(
      updateSubscription(workspaceBId, subA.id, { description: 'Sızma' }),
      /bulunamadı/
    );
    await assert.rejects(
      deleteSubscription(workspaceBId, subA.id),
      /bulunamadı/
    );

    // Silme
    await deleteSubscription(workspaceAId, subA.id);
    const afterDelete = await listSubscriptions(workspaceAId);
    assert.equal(afterDelete.length, 0);
  });

  it('geçersiz URL protokolü girildiğinde hata fırlatılır', async () => {
    await assert.rejects(
      createSubscription(workspaceAId, {
        url: 'javascript:alert(1)',
        events: ['*']
      }),
      /Geçerli bir webhook/
    );
  });

  it('HMAC-SHA256 payload imzalaması: doğru imza üretir ve doğrulanabilir', () => {
    const secret = 'whsec_test_secret_123';
    const payload = JSON.stringify({ event: 'content.published', data: { id: 1 } });
    const sig = signWebhookPayload(payload, secret);

    assert.ok(sig.startsWith('sha256='));
    const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
    assert.equal(sig, expected);
  });

  it('olay filtreleme: dispatchOutboundWebhook yalnızca eşleşen aboneliklere teslimat üretir', async () => {
    const subStar = await createSubscription(workspaceAId, {
      url: 'https://example.com/star',
      events: ['*']
    });
    const subContent = await createSubscription(workspaceAId, {
      url: 'https://example.com/content',
      events: ['content.published']
    });
    const subInbox = await createSubscription(workspaceAId, {
      url: 'https://example.com/inbox',
      events: ['inbox.message']
    });

    // 1. content.published olayı: subStar ve subContent eşleşmeli (2 teslimat)
    const deliveries1 = await dispatchOutboundWebhook(workspaceAId, 'content.published', { title: 'Test Başlık' });
    assert.equal(deliveries1.length, 2);

    // 2. account.connected olayı: yalnızca subStar eşleşmeli (1 teslimat)
    const deliveries2 = await dispatchOutboundWebhook(workspaceAId, 'account.connected', { accountId: 'acc-1' });
    assert.equal(deliveries2.length, 1);

    // 3. Pasif abonelik olay almaz
    await updateSubscription(workspaceAId, subInbox.id, { isActive: false });
    const deliveries3 = await dispatchOutboundWebhook(workspaceAId, 'inbox.message', { text: 'selam' });
    assert.equal(deliveries3.length, 1); // sadece subStar aktif
  });

  it('başarılı teslimat: 200 dönerse DELIVERED durumuna geçer ve imza başlıkları eksiksiz gider', async () => {
    const sub = await createSubscription(workspaceAId, {
      url: 'https://api.subscriber.test/webhook',
      events: ['content.published']
    });

    let sentHeaders: Headers | undefined;
    let sentBody: string | undefined;

    const mockFetch: typeof fetch = async (url, init) => {
      sentHeaders = new Headers(init?.headers);
      sentBody = String(init?.body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const deliveryIds = await dispatchOutboundWebhook(workspaceAId, 'content.published', { hello: 'world' });
    assert.equal(deliveryIds.length, 1);

    const result = await executeWebhookDelivery(deliveryIds[0], { fetchImpl: mockFetch });
    assert.equal(result.success, true);
    assert.equal(result.status, 'DELIVERED');
    assert.equal(result.httpStatus, 200);

    // Başlıkların denetimi
    assert.ok(sentHeaders);
    assert.ok(sentHeaders.get('x-socialflow-signature-256')?.startsWith('sha256='));
    assert.ok(sentHeaders.get('x-socialflow-timestamp'));
    assert.equal(sentHeaders.get('x-socialflow-event'), 'content.published');
    assert.equal(sentHeaders.get('user-agent'), 'SocialFlow-Webhooks/1.0');

    // Gönderilen imzanın doğrulanması
    const expectedSig = signWebhookPayload(sentBody!, sub.secret);
    assert.equal(sentHeaders.get('x-socialflow-signature-256'), expectedSig);
  });

  it('yeniden deneme (retry) ve exponential backoff: 500 hatasında RETRYING durumuna geçer', async () => {
    const sub = await createSubscription(workspaceAId, {
      url: 'https://failing-server.test/webhook',
      events: ['*']
    });

    const mockFailFetch: typeof fetch = async () => {
      return new Response('Internal Server Error', { status: 500, statusText: 'Server Error' });
    };

    const deliveryIds = await dispatchOutboundWebhook(workspaceAId, 'test.retry', {});
    const deliveryId = deliveryIds[0];

    const result = await executeWebhookDelivery(deliveryId, { fetchImpl: mockFailFetch });
    assert.equal(result.success, false);
    assert.equal(result.status, 'RETRYING');
    assert.equal(result.httpStatus, 500);
    assert.ok(result.nextRetryAt);

    const record = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
    assert.equal(record?.attempts, 1);
    assert.equal(record?.status, 'RETRYING');
  });

  it('Dead-Letter Queue (DLQ): maxAttempts aşıldığında DEAD_LETTER olur ve replay ile tekrar denenir', async () => {
    const sub = await createSubscription(workspaceAId, {
      url: 'https://dead-server.test/webhook',
      events: ['*']
    });

    const mockFailFetch: typeof fetch = async () => {
      throw new Error('Connection refused: ECONNREFUSED');
    };

    const deliveryIds = await dispatchOutboundWebhook(workspaceAId, 'test.dlq', {});
    const deliveryId = deliveryIds[0];

    // Teslimatın deneme sayısını maxAttempts - 1 (4) yapalım
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { attempts: 4 }
    });

    // 5. ve son deneme -> DEAD_LETTER olmalı
    const result = await executeWebhookDelivery(deliveryId, { fetchImpl: mockFailFetch });
    assert.equal(result.status, 'DEAD_LETTER');
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('ECONNREFUSED'));

    const deadRecord = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
    assert.equal(deadRecord?.status, 'DEAD_LETTER');
    assert.equal(deadRecord?.attempts, 5);

    // Dead-letter replay denemesi (sunucu düzeldiğinde)
    const mockSuccessFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ recovered: true }), { status: 200 });
    };

    // Replay fonksiyonu çağrıldığında yeniden dener ve başarılı olursa DELIVERED yapar
    const replayResult = await retryDeadLetterDelivery(workspaceAId, deliveryId, { fetchImpl: mockSuccessFetch });
    assert.equal(replayResult.status, 'DELIVERED');
    assert.equal(replayResult.success, true);

    const recoveredRecord = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
    assert.equal(recoveredRecord?.status, 'DELIVERED');
  });

  it('devre kesici (Circuit Breaker): 10 ardışık dead-letter olduğunda abonelik otomatik devre dışı bırakılır', async () => {
    const sub = await createSubscription(workspaceAId, {
      url: 'https://circuit-breaker.test/webhook',
      events: ['*']
    });

    // Aboneliğin hata sayacını 9 yapalım
    await prisma.webhookSubscription.update({
      where: { id: sub.id },
      data: { consecutiveFailures: 9 }
    });

    const mockFailFetch: typeof fetch = async () => {
      return new Response('Fatal Crash', { status: 503 });
    };

    const deliveryIds = await dispatchOutboundWebhook(workspaceAId, 'test.circuit', {});
    const deliveryId = deliveryIds[0];

    // Son denemeyi simüle et (attempts = 4)
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { attempts: 4 }
    });

    // 10. ardışık dead-letter
    await executeWebhookDelivery(deliveryId, { fetchImpl: mockFailFetch });

    const disabledSub = await prisma.webhookSubscription.findUnique({ where: { id: sub.id } });
    assert.equal(disabledSub?.isActive, false);
    assert.ok(disabledSub?.disabledAt);
    assert.ok(disabledSub?.disabledReason?.includes('Dead-Letter'));
  });

  it('FF_OUTGOING_WEBHOOKS=false olduğunda abonelik oluşturma reddedilir ve dispatch sessiz kalır', async () => {
    process.env.FF_OUTGOING_WEBHOOKS = 'false';
    try {
      await assert.rejects(
        createSubscription(workspaceAId, { url: 'https://test.local', events: ['*'] }),
        /FEATURE_DISABLED/
      );

      const dispatched = await dispatchOutboundWebhook(workspaceAId, 'event', {});
      assert.deepEqual(dispatched, []);
    } finally {
      process.env.FF_OUTGOING_WEBHOOKS = 'true';
    }
  });
});
