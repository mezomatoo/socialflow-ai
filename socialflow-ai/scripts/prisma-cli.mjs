#!/usr/bin/env node
/**
 * Prisma CLI sarmalayıcısı.
 *
 * `prisma` ikilisi, şema motorunu (schema engine) indirmeye çalışır. İndirme
 * başarısız olduğunda komutlar çalışmaz. Bu sarmalayıcı, `generate` gibi
 * komutların WASM şema motoruyla çalışması için `PRISMA_SCHEMA_ENGINE_BINARY`
 * değişkenini mevcut bir dosyaya işaret eder (Prisma bu durumda indirmeyi atlar
 * ve sürücü adaptörü + WASM motorunu kullanır).
 *
 * Kullanım: npm run prisma -- generate
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadEnv } from './lib/env.mjs';

const require = createRequire(import.meta.url);
loadEnv();

const args = process.argv.slice(2);
const env = { ...process.env };

// İndirmeyi atlatmak için var olan bir yürütülebilir dosya gösterilir.
if (!env.PRISMA_SCHEMA_ENGINE_BINARY) {
  env.PRISMA_SCHEMA_ENGINE_BINARY = process.execPath;
}

const cli = require.resolve('prisma/build/index.js');
const child = spawn(process.execPath, [cli, ...args], {
  stdio: 'inherit',
  env,
  cwd: process.cwd()
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (error) => {
  console.error(`[prisma] Komut çalıştırılamadı: ${error.message}`);
  process.exit(1);
});
