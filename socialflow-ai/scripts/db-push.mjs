#!/usr/bin/env node
/**
 * `prisma db push` eşdeğeri — WASM şema motoru + sürücü adaptörü üzerinden.
 *
 * Kullanım:
 *   npm run db:push                       # .env > DATABASE_URL
 *   npm run db:push -- --url file:./x.db  # adresi elle ver
 *   npm run db:push -- --reset            # veritabanını sıfırlayıp yeniden kur
 *
 * Not: Şema değişikliklerini veritabanına uygular (migration dosyası üretmez).
 * Üretim ortamında tercih edilen yaklaşım sürüm izlenen migration'lardır;
 * bu betik geliştirme/demo ve otomatik kurulum içindir.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  ROOT,
  SCHEMA_PATH,
  loadEnv,
  resolveDatabaseUrl,
  sqliteFilePath,
  isPostgresUrl,
  ensureWasmSchemaEngine,
  createAdapter,
  readSchema
} from './lib/env.mjs';

const require = createRequire(import.meta.url);

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  const reset = argv.includes('--reset');
  const schemaArgIdx = argv.indexOf('--schema');
  const schemaPath = schemaArgIdx >= 0 ? argv[schemaArgIdx + 1] : SCHEMA_PATH;
  const url = resolveDatabaseUrl(argv);

  ensureWasmSchemaEngine();

  if (reset) {
    if (isPostgresUrl(url)) {
      console.error('[db:push] --reset PostgreSQL üzerinde desteklenmiyor; veritabanını elle sıfırlayın.');
      process.exit(1);
    }
    const file = sqliteFilePath(url);
    for (const suffix of ['', '-journal', '-shm', '-wal']) {
      fs.rmSync(`${file}${suffix}`, { force: true });
    }
    console.log(`[db:push] Veritabanı sıfırlandı: ${file}`);
  }

  const { SchemaEngineWasm } = require('@prisma/migrate/dist/SchemaEngineWasm.js');
  const { bindMigrationAwareSqlAdapterFactory } = require('@prisma/driver-adapter-utils');

  const adapter = await createAdapter(url);
  const bound = bindMigrationAwareSqlAdapterFactory(adapter);
  const schema = readSchema(schemaPath);

  const engine = await SchemaEngineWasm.setup({
    adapter: bound,
    schemaContext: { schemaFiles: [[schema.path, schema.content]] }
  });

  const result = await engine.runCommand('schemaPush', {
    force: true,
    schema: { files: [schema] },
    filters: { externalTables: [], externalEnums: [] }
  });

  console.log(
    `[db:push] ${url}\n[db:push] uygulanan adım: ${result.executedSteps}` +
      (result.warnings?.length ? `\n[db:push] uyarı: ${result.warnings.join(' | ')}` : '')
  );

  if (result.unexecutable?.length) {
    console.error(`[db:push] Uygulanamayan değişiklikler:\n - ${result.unexecutable.join('\n - ')}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[db:push] Hata: ${error?.message ?? error}`);
    process.exit(1);
  });
