#!/usr/bin/env node
/**
 * Test veritabanını hazırlar: şemayı uygular ve demo verisini yükler.
 * `npm run test:setup`
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';

loadEnv();

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'file:./prisma/test.db';
const env = { ...process.env, DATABASE_URL: TEST_DB_URL };

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, cwd: ROOT });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} → ${code}`))));
    child.on('error', reject);
  });
}

const node = process.execPath;

try {
  await run(node, [path.join(ROOT, 'scripts', 'db-push.mjs'), '--url', TEST_DB_URL, '--reset']);
  await run(node, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(ROOT, 'prisma', 'seed.ts')]);
  console.log(`[test:setup] Test veritabanı hazır: ${TEST_DB_URL}`);
} catch (error) {
  console.error(`[test:setup] Hata: ${error.message}`);
  process.exit(1);
}
