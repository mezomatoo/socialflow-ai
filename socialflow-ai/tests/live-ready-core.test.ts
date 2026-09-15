/**
 * Canlıya hazır çekirdek testler (Faz 7 §13, §15, §21)
 * ---------------------------------------------------------------------------
 * - Simülasyon (demo) modu: geliştirmede açıkça istenirse çalışır, ÜRETİMDE
 *   HİÇBİR KOŞULDA zorlanamaz (yanlış env'e karşı savunma).
 * - Yeni kayıt olan çalışma alanları GERÇEK modda başlar (demoMode: false).
 * - Şema + marka varsayılanları canlı duruşa ayarlı.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { resolveDemoMode } from '../src/lib/env';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

describe('Canlıya hazır çekirdek', () => {
  it('demo modu geliştirmede yalnızca açıkça istenirse açılır', () => {
    assert.equal(resolveDemoMode(undefined, false), false, 'ayarlanmamış → canlı');
    assert.equal(resolveDemoMode('false', false), false);
    assert.equal(resolveDemoMode('true', false), true);
    assert.equal(resolveDemoMode('1', false), true);
  });

  it('demo modu ÜRETİMDE ZORUNLU KAPALIDIR (env yanlış olsa bile)', () => {
    assert.equal(resolveDemoMode('true', true), false, 'üretimde DEMO_MODE=true bile kapatılır');
    assert.equal(resolveDemoMode('1', true), false);
  });

  it('yeni kayıt CANLI modda çalışma alanı açar', () => {
    const source = read('src/app/api/v1/auth/register/route.ts');
    assert.ok(/demoMode:\s*false/.test(source), 'register demoMode: false ile çalışma alanı açmalı');
    assert.ok(!/demoMode:\s*true/.test(source), 'register demoMode: true içermemeli');
  });

  it('şema ve marka varsayılanları canlı duruşa ayarlı', () => {
    const schema = read('prisma/schema.prisma');
    assert.ok(schema.includes('demoMode  Boolean  @default(false)'), 'Workspace.demoMode varsayılanı false olmalı');
    assert.ok(!schema.includes('demoMode  Boolean  @default(true)'), 'eski true varsayılanı kalmamalı');
    assert.ok(schema.includes('demoMode          Boolean   @default(false)'), 'Publication.demoMode varsayılanı false olmalı');
    const branding = read('src/lib/settings/appSettings.ts');
    assert.ok(branding.includes('demoMode: false'), 'marka varsayılanı demoMode: false olmalı');
    assert.ok(branding.includes('demoBanner: false'), 'marka varsayılanı demoBanner: false olmalı');
  });
});
