import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'crypto';
import prisma from '../src/lib/prisma';
import {
  verifyWebhookSignature,
  validWebhookTimestamp,
  verifyWebhookSubscription,
  recordInboundEvent,
  processInboundWebhook,
  resolveProviderWebhookSecret
} from '../src/lib/webhooks/incoming';
import { GET as inboundGet, POST as inboundPost } from '../src/app/api/v1/webhooks/inbound/[provider]/route';
import { NextRequest } from 'next/server';

if (!process.env.DATABASE_URL?.endsWith('test.db')) {
  throw new Error('Yalnızca ayrı test.db üzerinde çalıştırın.');
}

describe('① Webhook Güvenlik Temeli ve Deduplication İskeleti (§78)', () => {
  const secret = 'webhook-test-secret-key-12345';
  const provider = 'INSTAGRAM';
  let createdEventIds: string[] = [];

  before(() => {
    process.env.INSTAGRAM_WEBHOOK_SECRET = secret;
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = 'meta-verify-token-xyz';
  });

  after(async () => {
    if (createdEventIds.length > 0) {
      await prisma.inboundWebhookEvent.deleteMany({
        where: { id: { in: createdEventIds } }
      });
      await prisma.job.deleteMany({
        where: { type: 'InboundWebhookJob' }
      });
    }
  });

  it('HMAC-SHA256 imza doğrulaması: doğru imzayı onaylar, sahte/eksik imzayı reddeder', () => {
    const raw = Buffer.from('{"entry":[{"id":"123","time":1726435200}]}');
    const validHmac = createHmac('sha256', secret).update(raw).digest('hex');

    // sha256= ön eki ile
    assert.equal(verifyWebhookSignature(raw, `sha256=${validHmac}`, secret), true);
    // yalın hex ile
    assert.equal(verifyWebhookSignature(raw, validHmac, secret), true);

    // Yanlış imza
    const wrongHmac = createHmac('sha256', 'wrong-secret').update(raw).digest('hex');
    assert.equal(verifyWebhookSignature(raw, `sha256=${wrongHmac}`, secret), false);

    // Değiştirilmiş gövde
    assert.equal(verifyWebhookSignature(Buffer.from('{"tampered":true}'), `sha256=${validHmac}`, secret), false);

    // Boş veya geçersiz parametreler
    assert.equal(verifyWebhookSignature(raw, null, secret), false);
    assert.equal(verifyWebhookSignature(raw, '', secret), false);
    assert.equal(verifyWebhookSignature(raw, 'sha256=invalid', secret), false);
    assert.equal(verifyWebhookSignature(raw, `sha256=${validHmac}`, ''), false);
  });

  it('zaman damgası denetimi (replay saldırı koruması): tolerans içi geçerli, eski/gelecek geçersiz', () => {
    const now = Date.now();
    const nowSec = Math.floor(now / 1000);

    // Şimdiki zaman: geçerli
    assert.equal(validWebhookTimestamp(nowSec, { now }), true);
    assert.equal(validWebhookTimestamp(now, { now }), true);

    // 2 saat öncesi: Meta 36 saat retry toleransı içinde geçerli
    assert.equal(validWebhookTimestamp(nowSec - 7200, { now }), true);

    // 37 saat öncesi: 36 saat sınırını aştığı için geçersiz
    assert.equal(validWebhookTimestamp(nowSec - 37 * 3600, { now }), false);

    // Gelecekte 10 dakika sonrası (saat kayması toleransı 5 dk): geçersiz
    assert.equal(validWebhookTimestamp(nowSec + 600, { now }), false);

    // Sayısal olmayan / geçersiz değerler
    assert.equal(validWebhookTimestamp('invalid'), false);
    assert.equal(validWebhookTimestamp(null), false);
  });

  it('Meta subscription challenge (hub.challenge): doğru token ile onaylar, yanlışta null döner', () => {
    const challenge = 'random_challenge_string_98765';
    const verifyToken = 'meta-verify-token-xyz';

    assert.equal(
      verifyWebhookSubscription({
        mode: 'subscribe',
        token: verifyToken,
        expectedToken: verifyToken,
        challenge
      }),
      challenge
    );

    // Yanlış token
    assert.equal(
      verifyWebhookSubscription({
        mode: 'subscribe',
        token: 'wrong-token',
        expectedToken: verifyToken,
        challenge
      }),
      null
    );

    // Yanlış mode
    assert.equal(
      verifyWebhookSubscription({
        mode: 'unsubscribe',
        token: verifyToken,
        expectedToken: verifyToken,
        challenge
      }),
      null
    );
  });

  it('event-ID bazlı kalıcı tekilleştirme (deduplication skeleton): mükerrer callback kuyruğa tekrar girmez', async () => {
    const eventId = `test_evt_${randomBytes(6).toString('hex')}`;
    const payload = JSON.stringify({ message: 'yeni yorum', timestamp: Date.now() });

    // 1. Geliş: İlk kayıt oluşturulur ve kuyruğa alınır
    const firstResult = await recordInboundEvent({
      provider,
      eventId,
      eventType: 'comment',
      rawBody: payload
    });
    createdEventIds.push(firstResult.id);

    assert.equal(firstResult.duplicate, false);
    assert.equal(firstResult.status, 'PENDING');
    assert.equal(firstResult.eventId, eventId);

    // Kuyrukta tam olarak 1 adet iş bulunmalı
    const job = await prisma.job.findUnique({
      where: { idempotencyKey: `inbound:${provider}:${eventId}` }
    });
    assert.ok(job);
    assert.equal(job.type, 'InboundWebhookJob');

    // 2. Geliş: Sağlayıcı aynı payload ile tekrar gönderdiğinde (network retry)
    const duplicateResult = await recordInboundEvent({
      provider,
      eventId,
      eventType: 'comment',
      rawBody: payload
    });

    assert.equal(duplicateResult.duplicate, true);
    assert.equal(duplicateResult.duplicateMismatch, false);
    assert.equal(duplicateResult.id, firstResult.id);

    // Kuyrukta hala tek bir iş olmalı (çift kuyruk girişi yok)
    const jobsCount = await prisma.job.count({
      where: { idempotencyKey: `inbound:${provider}:${eventId}` }
    });
    assert.equal(jobsCount, 1);
  });

  it('aynı eventId ile farklı payload geldiğinde payload uyuşmazlığı tespit edilir', async () => {
    const eventId = `test_evt_mismatch_${randomBytes(6).toString('hex')}`;
    const originalPayload = JSON.stringify({ version: 1 });
    const alteredPayload = JSON.stringify({ version: 2 });

    const first = await recordInboundEvent({
      provider,
      eventId,
      eventType: 'mention',
      rawBody: originalPayload
    });
    createdEventIds.push(first.id);
    assert.equal(first.duplicate, false);

    // Farklı içerikle aynı eventId
    const second = await recordInboundEvent({
      provider,
      eventId,
      eventType: 'mention',
      rawBody: alteredPayload
    });

    assert.equal(second.duplicate, true);
    assert.equal(second.duplicateMismatch, true);
  });

  it('kuyruk işçisi olay işleme iskeleti (processInboundWebhook): durumu PROCESSED yapar ve idempotenttir', async () => {
    const eventId = `test_proc_${randomBytes(6).toString('hex')}`;
    const res = await recordInboundEvent({
      provider,
      eventId,
      eventType: 'message',
      rawBody: '{"text":"test"}'
    });
    createdEventIds.push(res.id);

    // İşleyici çalıştırılır
    const processed = await processInboundWebhook(res.id);
    assert.equal(processed.success, true);
    assert.equal(processed.event.status, 'PROCESSED');

    // Tekrar çalıştırıldığında idempotent davranır
    const rerun = await processInboundWebhook(res.id);
    assert.equal(rerun.success, true);
    assert.equal(rerun.event.duplicate, true);
  });

  it('Inbound Webhook HTTP Route: GET challenge ve POST imza doğrulama uçtan uca çalışır', async () => {
    // 1. GET Subscription Challenge
    const getUrl = new URL('http://localhost/api/v1/webhooks/inbound/instagram?hub.mode=subscribe&hub.verify_token=meta-verify-token-xyz&hub.challenge=test_challenge_123');
    const getReq = new NextRequest(getUrl);
    const getRes = await inboundGet(getReq, { params: { provider: 'instagram' } });
    assert.equal(getRes.status, 200);
    assert.equal(await getRes.text(), 'test_challenge_123');

    // 2. POST İmzasız İstek -> 401
    const postReqNoSig = new NextRequest('http://localhost/api/v1/webhooks/inbound/instagram', {
      method: 'POST',
      body: JSON.stringify({ test: true })
    });
    const postResNoSig = await inboundPost(postReqNoSig, { params: { provider: 'instagram' } });
    assert.equal(postResNoSig.status, 401);

    // 3. POST Geçerli İmzalı İstek -> 200 + queued
    const bodyStr = JSON.stringify({ id: `http_evt_${randomBytes(4).toString('hex')}`, entry: [{ id: '1' }] });
    const hmac = 'sha256=' + createHmac('sha256', secret).update(bodyStr).digest('hex');

    const postReqValid = new NextRequest('http://localhost/api/v1/webhooks/inbound/instagram', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': hmac
      },
      body: bodyStr
    });
    const postResValid = await inboundPost(postReqValid, { params: { provider: 'instagram' } });
    assert.equal(postResValid.status, 200);
    const validData = await postResValid.json();
    assert.equal(validData.received, true);
    assert.equal(validData.duplicate, false);
    assert.equal(validData.status, 'queued');

    // 4. POST Aynı İmzalı İsteğin Tekrarı -> 200 + duplicate_acknowledged
    const postReqDup = new NextRequest('http://localhost/api/v1/webhooks/inbound/instagram', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': hmac
      },
      body: bodyStr
    });
    const postResDup = await inboundPost(postReqDup, { params: { provider: 'instagram' } });
    assert.equal(postResDup.status, 200);
    const dupData = await postResDup.json();
    assert.equal(dupData.received, true);
    assert.equal(dupData.duplicate, true);
    assert.equal(dupData.status, 'duplicate_acknowledged');
  });
});
