/**
 * Seed güvenlik kapısı testleri (Faz 7 §15)
 * ---------------------------------------------------------------------------
 * - Geliştirme/test ortamında seed serbesttir.
 * - Üretimde seed ENGELLENİR; engel gerekçesi SEED_ALLOW_PRODUCTION'ı açıkça
 *   anlatır.
 * - Açık onayla (SEED_ALLOW_PRODUCTION=true) üretim seed geçer.
 * - seed.ts kapıyı GERÇEKTEN kullanıyor (kablolama metin olarak doğrulanır).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { isSeedAllowed } from '../prisma/seed-guard';

describe('Seed güvenlik kapısı', () => {
  it('geliştirme ortamında seed serbesttir', () => {
    const result = isSeedAllowed({ isProduction: false, allowProductionSeed: false });
    assert.equal(result.allowed, true);
  });

  it('üretimde seed ENGELLENİR ve açık onay değişkenini anlatır', () => {
    const result = isSeedAllowed({ isProduction: true, allowProductionSeed: false });
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('SEED_ALLOW_PRODUCTION'), 'gerekçe açık onay değişkenini içermeli');
    assert.ok(result.reason?.includes('sil'), 'gerekçe yıkıcı etkisini belirtmeli');
  });

  it('açık onayla üretim seed geçebilir', () => {
    const result = isSeedAllowed({ isProduction: true, allowProductionSeed: true });
    assert.equal(result.allowed, true);
  });

  it('seed.ts kapıyı kullanıyor (kablolama doğrulaması)', () => {
    const seedPath = path.join(process.cwd(), 'prisma', 'seed.ts');
    const source = fs.readFileSync(seedPath, 'utf8');
    assert.ok(source.includes('isSeedAllowed'), 'seed.ts isSeedAllowed çağırmalı');
    assert.ok(source.includes('process.exit(1)'), 'engellenen seed süreçten çıkmalı');
    // Kapı, temizleme işleminden ÖNCE gelmeli
    const gateIndex = source.indexOf('isSeedAllowed({');
    const wipeIndex = source.indexOf('Veritabanı temizleniyor');
    assert.ok(gateIndex > -1 && wipeIndex > -1 && gateIndex < wipeIndex, 'kapı temizlemeden önce olmalı');
  });
});
