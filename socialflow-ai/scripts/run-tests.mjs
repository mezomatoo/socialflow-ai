#!/usr/bin/env node
/**
 * Testleri test veritabanına karşı çalıştırır.
 * `npm run test` — önce `npm run test:setup` çalıştırılmış olmalıdır.
 *
 * Entegrasyon notu: 3eb (Faz 5-6) testlerinden bazıları GERÇEK (demo olmayan)
 * OAuth akışını doğrular; bu dosyalar kendi npm script'lerinde `DEMO_MODE=false`
 * gibi özel ortam değişkenleriyle çalıştırılırdı. Aynı ortam imzasına sahip
 * dosyalar tek bir tsx process'inde gruplanır; her grup kendi env'iyle çalışır.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';

loadEnv();

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'file:./prisma/test.db';
const testsDir = path.join(ROOT, 'tests');

/** Dosya başına ek ortam değişkenleri (3eb'nin özel test script'lerinden). */
const EXTRA_ENV = {
  'tests/account-registration.test.ts': { DEMO_MODE: 'false' },
  'tests/instagram-connection.test.ts': {
    DEMO_MODE: 'false',
    APP_URL: 'https://oauth-test.invalid',
    INSTAGRAM_APP_ID: 'test-only',
    INSTAGRAM_APP_SECRET: 'test-only'
  }
};

const files = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => path.join('tests', f));

if (!files.length) {
  console.error('[test] Test dosyası bulunamadı.');
  process.exit(1);
}

const tsx = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** Ortam imzasına göre grupla (varsayılan grup + özel env grupları). */
const groups = new Map();
for (const file of files) {
  const extra = EXTRA_ENV[file] || {};
  const key = JSON.stringify(extra);
  if (!groups.has(key)) groups.set(key, { extra, files: [] });
  groups.get(key).files.push(file);
}

let exitCode = 0;
for (const { extra, files: groupFiles } of groups.values()) {
  if (Object.keys(extra).length) {
    console.log(`[test] Özel ortamla çalıştırılıyor: ${groupFiles.join(', ')}`);
  }
  const env = { ...process.env, DATABASE_URL: TEST_DB_URL, APP_ENV: 'test', ...extra };
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [tsx, '--test', ...groupFiles], { stdio: 'inherit', env, cwd: ROOT });
    child.on('exit', (c) => resolve(c ?? 0));
    child.on('error', (error) => {
      console.error(`[test] Çalıştırılamadı: ${error.message}`);
      resolve(1);
    });
  });
  if (code !== 0) exitCode = code;
}
process.exit(exitCode);
