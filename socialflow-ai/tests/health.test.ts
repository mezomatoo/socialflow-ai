/**
 * Üretim sağlık kontrolleri (Faz 7 §56, §115, §146)
 * ---------------------------------------------------------------------------
 * - Liveness (/api/health) bağımlılık kontrolü yapmadan 200 döner.
 * - Readiness (/api/health/ready) VERİTABANININ GERÇEK durumunu bildirir;
 *   sahte yeşil durum yoktur (DB açıksa ready, erişilemezse 503).
 * - Yanıtlarda gizli değer (anahtar, bağlantı cümlesi) sızmez.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GET as liveness } from '../src/app/api/health/route';
import { GET as readiness } from '../src/app/api/health/ready/route';

describe('Sağlık uçları (üretim hazırlık)', () => {
  it('liveness bağımlılıksız 200 + ok döner', async () => {
    const res = await liveness(new Request('http://localhost/api/health'), { params: {} } as never);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; data: { status: string } };
    assert.equal(body.ok, true);
    assert.equal(body.data.status, 'ok');
  });

  it('readiness veritabanı AÇIKken gerçek ready bildirir', async () => {
    const res = await readiness(new Request('http://localhost/api/health/ready'), { params: {} } as never);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; data: { status: string; checks: { database: boolean } } };
    assert.equal(body.ok, true);
    assert.equal(body.data.checks.database, true, 'test veritabanı açıkken database:true olmalı');
    assert.equal(body.data.status, 'ready');
  });

  it('readiness yanıtı gizli değer içermez', async () => {
    const res = await readiness(new Request('http://localhost/api/health/ready'), { params: {} } as never);
    const text = await res.text();
    assert.ok(!text.toLowerCase().includes('postgres://'), 'bağlantı cümlesi sızmamalı');
    assert.ok(!text.includes('SESSION_SECRET'), 'oturum anahtarı sızmamalı');
    assert.ok(!text.includes('TOKEN_ENCRYPTION_KEY'), 'şifreleme anahtarı sızmamalı');
  });
});
