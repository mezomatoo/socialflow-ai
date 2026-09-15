#!/usr/bin/env node
/**
 * Testleri test veritabanına karşı çalıştırır.
 * `npm run test` — önce `npm run test:setup` çalıştırılmış olmalıdır.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';

loadEnv();

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'file:./prisma/test.db';
const testsDir = path.join(ROOT, 'tests');
const files = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => path.join('tests', f));

if (!files.length) {
  console.error('[test] Test dosyası bulunamadı.');
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: TEST_DB_URL, APP_ENV: 'test' };
const tsx = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const child = spawn(process.execPath, [tsx, '--test', ...files], { stdio: 'inherit', env, cwd: ROOT });
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (error) => {
  console.error(`[test] Çalıştırılamadı: ${error.message}`);
  process.exit(1);
});
