/**
 * Güvenlik başlıkları testleri (Faz 7 §43, §44)
 * ---------------------------------------------------------------------------
 * - nosniff / Referrer-Policy / Permissions-Policy HER ortamda.
 * - HSTS + X-Frame-Options DENY + CSP YALNIZ üretimde (önizleme iframe'i
 *   geliştirme/demo modunda bozulmamalı).
 * - Üretim CSP'si object-src 'none' + base-uri 'self' + frame-ancestors 'none'
   ile kod enjeksiyon vektörlerini kapatır.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { securityHeaders } from '../src/lib/security/headers';

describe('Güvenlik başlıkları', () => {
  it('her ortamda nosniff + referrer + permissions-policy verir', () => {
    for (const isProduction of [false, true]) {
      const h = securityHeaders(isProduction);
      assert.equal(h['X-Content-Type-Options'], 'nosniff');
      assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
      assert.ok(h['Permissions-Policy'].includes('camera=()'));
    }
  });

  it('üretimde HSTS + frame DENY + CSP verir', () => {
    const h = securityHeaders(true);
    assert.equal(h['Strict-Transport-Security'], 'max-age=63072000; includeSubDomains');
    assert.equal(h['X-Frame-Options'], 'DENY');
    assert.ok(h['Content-Security-Policy'].includes("frame-ancestors 'none'"));
    assert.ok(h['Content-Security-Policy'].includes("object-src 'none'"));
    assert.ok(h['Content-Security-Policy'].includes("base-uri 'self'"));
  });

  it('üretim DIŞINDA frame koruması ve HSTS YOKTUR (önizleme iframe uyumu)', () => {
    const h = securityHeaders(false);
    assert.equal(h['X-Frame-Options'], undefined);
    assert.equal(h['Strict-Transport-Security'], undefined);
    assert.equal(h['Content-Security-Policy'], undefined);
  });

  it('CSP script kaynağı data: ve * jokerine izin vermez', () => {
    const csp = securityHeaders(true)['Content-Security-Policy'] ?? '';
    assert.ok(!csp.includes('script-src *'), 'script-src * olmamalı');
    assert.ok(!/script-src[^;]*data:/.test(csp), 'script-src data: olmamalı');
  });
});
