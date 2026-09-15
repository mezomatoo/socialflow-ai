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
    assert.ok(r.friendlyMessage.includes('yeniden bağlanmanız'), r.friendlyMessage);
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
