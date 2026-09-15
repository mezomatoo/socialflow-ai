/**
 * §16 / §47 — Depolama katmanı: S3 uyumlu sürücü imzası ve yol güvenliği.
 * ---------------------------------------------------------------------------
 * Ağ erişimi olmayan ortamda S3'e gerçek istek atılamaz; bu yüzden imzalama
 * algoritması AWS'nin RESMÎ test vektörüyle doğrulanır (S3 "GET Object"
 * örneği). İmza doğruysa AWS/MinIO/R2/B2 gibi S3 uyumlu her sağlayıcı aynı
 * imzayı kabul eder.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { signV4, presignV4, sha256Hex, uriEncode, EMPTY_SHA256 } from '../src/lib/storage/sigv4';

// AWS dokümantasyonundaki örnek kimlik bilgileri (herkese açık, gerçek değil).
const ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

describe('S3 SigV4 imzalama (§16)', () => {
  it('AWS resmî test vektörü: GET Object imzası birebir üretilir', () => {
    const result = signV4({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      headers: { range: 'bytes=0-9' },
      payloadHash: EMPTY_SHA256,
      region: 'us-east-1',
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      amzDate: '20130524T000000Z'
    });

    assert.equal(
      result.authorization,
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'
    );
    assert.equal(result.scope, '20130524/us-east-1/s3/aws4_request');
    assert.equal(result.signedHeaders, 'host;range;x-amz-content-sha256;x-amz-date');
  });

  it('boş gövde karma değeri standart SHA-256 sabitidir', () => {
    assert.equal(sha256Hex(''), EMPTY_SHA256);
    assert.equal(sha256Hex(Buffer.from('')), EMPTY_SHA256);
  });

  it('dosya anahtarları RFC3986 kurallarına göre kodlanır (Türkçe karakterler dahil)', () => {
    assert.equal(uriEncode('urun gorseli.jpg'), 'urun%20gorseli.jpg');
    assert.equal(uriEncode('a/b/c.jpg', false), 'a/b/c.jpg');
    assert.equal(uriEncode('görsel.png'), 'g%C3%B6rsel.png');
    assert.equal(uriEncode('a+b&c=d'), 'a%2Bb%26c%3Dd');
  });

  it('ön imzalı URL kimlik bilgisi sızdırmaz, süre ve imza taşır', () => {
    const url = presignV4({
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      region: 'us-east-1',
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      amzDate: '20130524T000000Z',
      expiresIn: 900
    });
    assert.ok(url.startsWith('https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256'));
    assert.ok(url.includes('X-Amz-Expires=900'));
    assert.ok(/X-Amz-Signature=[0-9a-f]{64}$/.test(url));
    assert.ok(!url.includes(SECRET_KEY), 'gizli anahtar URL içinde OLMAMALI');
  });

  it('yerel depolama sürücüsü yol gezinmesini engeller', async () => {
    const { makeStorageKey } = await import('../src/lib/storage/storage');
    const key = makeStorageKey('ws-1', 'originals', '../../etc/passwd');
    assert.ok(!key.includes('..'), 'anahtar ".." içermemeli');
    assert.ok(key.startsWith('ws-1/originals/'));
  });
});
