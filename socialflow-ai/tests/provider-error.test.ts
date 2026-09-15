import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toFriendlyError, safeProviderMessage } from '../src/lib/social/errors';

/**
 * Faz 2 — Sağlayıcı hata normalleştirici sözleşmesi (§56-§57):
 * ham sağlayıcı hataları stabil kodlara + Türkçe mesajlara dönüşür;
 * kullanıcıya asla ham "OAuthException 190" benzeri mesaj gösterilmez.
 */
describe('ProviderErrorNormalizer', () => {
  it('token süresi → TOKEN_EXPIRED + yeniden bağlama aksiyonu', () => {
    const r = toFriendlyError({ code: 'OAuthException', message: 'Error validating access token: Session has expired', httpStatus: 400 });
    assert.equal(r.normalizedCode, 'TOKEN_EXPIRED');
    assert.equal(r.retryable, false);
    assert.ok(/yeniden bağlanmanız/i.test(r.friendlyMessage), r.friendlyMessage);
    assert.equal(r.action?.route, '/app/hesaplar');
  });

  it('hız sınırı → RATE_LIMITED ve tekrarlanabilir', () => {
    const r = toFriendlyError({ message: 'rate limit exceeded', httpStatus: 429 });
    assert.equal(r.normalizedCode, 'RATE_LIMITED');
    assert.equal(r.retryable, true);
  });

  it('5xx → PROVIDER_TEMPORARY_ERROR ve tekrarlanabilir', () => {
    const r = toFriendlyError({ message: 'Internal server error', httpStatus: 503 });
    assert.equal(r.normalizedCode, 'PROVIDER_TEMPORARY_ERROR');
    assert.equal(r.retryable, true);
  });

  it('izin hatası → PERMISSION_DENIED', () => {
    const r = toFriendlyError({ message: 'insufficient scope for this action', httpStatus: 403 });
    assert.equal(r.normalizedCode, 'PERMISSION_DENIED');
    assert.equal(r.retryable, false);
  });

  it('geçersiz medya → MEDIA_INVALID, tekrarlanamaz', () => {
    const r = toFriendlyError({ message: 'Unsupported media type: image/tiff' });
    assert.equal(r.normalizedCode, 'MEDIA_INVALID');
    assert.equal(r.retryable, false);
  });

  it('karakter sınırı → CAPTION_INVALID', () => {
    const r = toFriendlyError({ message: 'Status is over 280 characters.' });
    assert.equal(r.normalizedCode, 'CAPTION_INVALID');
    assert.equal(r.retryable, false);
  });

  it('bilinmeyen 4xx → UNKNOWN_PROVIDER_ERROR, tekrarlanamaz', () => {
    const r = toFriendlyError({ message: 'something entirely unexpected', httpStatus: 400 });
    assert.equal(r.normalizedCode, 'UNKNOWN_PROVIDER_ERROR');
    assert.equal(r.retryable, false);
    assert.ok(r.friendlyMessage.length > 20, 'Türkçe açıklama hep olmalı');
  });

  it('status olmayan ağ hatası varsayılan olarak tekrarlanabilir', () => {
    const r = toFriendlyError({ message: 'totally unknown provider quirk' });
    assert.equal(r.retryable, true);
    assert.equal(r.normalizedCode, 'PROVIDER_TEMPORARY_ERROR');
  });

  it('ham mesaj kısaltması 800 karakterle sınırlı', () => {
    const long = 'x'.repeat(5000);
    assert.ok(safeProviderMessage(long).length <= 800);
  });
});

describe('Retry-After desteği (Faz 2 §78)', () => {
  it('parseRetryAfter: saniye, HTTP-date ve geçersiz başlıkları doğru çözer', async () => {
    const { parseRetryAfter } = await import('../src/lib/social/BaseSocialProvider');
    assert.equal(parseRetryAfter('30'), 30_000);
    assert.equal(parseRetryAfter('0'), 0);
    assert.equal(parseRetryAfter(null), null);
    assert.equal(parseRetryAfter('abc'), null, 'geçersiz başlık null dönmeli');
    assert.equal(parseRetryAfter('999999'), null, '1 günden uzun öneri reddedilir');
    const httpDate = new Date(Date.now() + 60_000).toUTCString();
    const ms = parseRetryAfter(httpDate);
    assert.ok(ms !== null && ms > 50_000 && ms <= 60_000, 'HTTP-date göreli ms üretmeli');
  });

  it('failJob exact: attempts ile carpilmadan kesin gecikme uygulanir', async () => {
    const { enqueue, failJob, claimNextJob } = await import('../src/lib/queue/queue');
    const { prisma } = await import('./helpers');
    const ws = await prisma.workspace.create({ data: { name: 'RA-W', slug: `ra-${Date.now()}-${Math.floor(Math.random()*1e6)}` } });
    const job = await enqueue({
      workspaceId: ws.id,
      type: 'TokenRefreshJob',
      payload: { accountId: 'x' },
      idempotencyKey: `ra-test-${Date.now()}-${Math.floor(Math.random()*1e6)}`
    });
    if (!job.created || !job.id) throw new Error('is kuyruga alinamadi');
    // attempts'u 2'ye cikar (claim) — dogrusal backoff 60*2=120sn verirdi; exact 120sn ayni gorunur.
    // Ayirt etmek icin exact=30sn veriyoruz: dogrusal olsaydi attempts(1)*60=60sn, exact ile ~30sn.
    await claimNextJob('worker-test-ra');
    await failJob(job.id, 'hiz siniri', 30_000, { exact: true });
    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    const deltaSec = Math.round(((after.runAt?.getTime() ?? 0) - Date.now()) / 1000);
    assert.ok(deltaSec >= 28 && deltaSec <= 31, `kesin gecikme ~30sn olmali, gercek: ${deltaSec}sn`);
    await prisma.job.delete({ where: { id: job.id } }).catch(() => {});
    await prisma.workspace.delete({ where: { id: ws.id } }).catch(() => {});
  });
});
