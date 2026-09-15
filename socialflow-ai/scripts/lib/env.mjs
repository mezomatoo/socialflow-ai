/**
 * Ortak betik yardımcıları (yalnızca geliştirici betikleri — uygulama kodundan
 * bağımsızdır).
 *
 * Amaç: `.env` dosyasını yüklemek, veritabanı adresini çözmek ve Prisma'nın
 * WASM şema motoru ile sürücü adaptörlerini (driver adapter) hazırlamak.
 *
 * Neden WASM? Prisma 7, sorgu motorunu (query compiler) WASM olarak taşır ve
 * sürücü adaptörleriyle çalışır. `db push` için kullanılan şema motoru ise
 * normalde ikili (native) bir dosya indirir. Kısıtlı/çevrimdışı ortamlarda bu
 * indirme başarısız olabildiğinden betikler, npm ile gelen WASM şema motorunu
 * kullanır. Aynı yöntem çevrimiçi ortamlarda da geçerlidir.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCHEMA_PATH = path.join(ROOT, 'prisma', 'schema.prisma');

/** `.env` dosyasını (varsa) process.env içine yükler. */
export function loadEnv(file = path.join(ROOT, '.env')) {
  try {
    if (typeof process.loadEnvFile === 'function' && fs.existsSync(file)) {
      process.loadEnvFile(file);
    }
  } catch {
    // .env yoksa veya okunamıyorsa sessizce devam et (CI ortamları).
  }
}

/** Veritabanı adresini çözer: --url argümanı > DATABASE_URL > varsayılan SQLite. */
export function resolveDatabaseUrl(argv = process.argv.slice(2)) {
  const idx = argv.indexOf('--url');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  if (argv.includes('--test')) {
    const test = process.env.TEST_DATABASE_URL || 'file:./prisma/test.db';
    return test;
  }
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  return `file:${path.join(ROOT, 'prisma', 'dev.db')}`;
}

export function isPostgresUrl(url) {
  return /^postgres(ql)?:\/\//i.test(url);
}

/** `file:` adresini mutlak yola çevirir (göreli adresler proje köküne göredir). */
export function sqliteFilePath(url) {
  const raw = url.replace(/^file:/, '');
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

/**
 * `@prisma/internals`, şema motoru WASM dosyasını `build/schema_engine_bg.wasm`
 * altında arar. Bu dosya normalde indirme adımında kopyalanır; indirme
 * yapılamadığında npm paketi olarak gelen WASM dosyasını yerine koyarız.
 */
export function ensureWasmSchemaEngine() {
  const internalsEntry = path.dirname(require.resolve('@prisma/internals'));
  const internalsRoot = path.basename(internalsEntry) === 'dist' ? path.dirname(internalsEntry) : internalsEntry;
  // @prisma/internals sürümleri WASM dosyasını farklı göreli yollarda arar;
  // tüm olası konumlara kopyalanır (paket içeriği salt okunur olabilir).
  const targets = [
    path.join(internalsRoot, 'build', 'schema_engine_bg.wasm'),
    path.join(internalsRoot, 'dist', 'build', 'schema_engine_bg.wasm')
  ];

  try {
    // Paket alt yolu (subpath) dışa aktarılmadığı için dosya doğrudan aranır.
    const wasmDir = path.dirname(
      require.resolve('@prisma/schema-engine-wasm', {
        paths: [ROOT, path.join(ROOT, 'node_modules', '@prisma', 'internals')]
      })
    );
    const source = path.join(wasmDir, 'schema_engine_bg.wasm');
    const sourceSize = fs.statSync(source).size;

    for (const target of targets) {
      const current = fs.existsSync(target) ? fs.statSync(target).size : -1;
      if (current !== sourceSize) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      }
    }
    return targets[0];
  } catch (error) {
    throw new Error(
      `Şema motoru (schema engine) WASM dosyası hazırlanamadı: ${String(error)}`
    );
  }
}

/** Sürücü adaptörünü (driver adapter factory) adrese göre üretir. */
export async function createAdapter(url) {
  if (isPostgresUrl(url)) {
    const { PrismaPg } = await import('@prisma/adapter-pg');
    return new PrismaPg({ connectionString: url });
  }
  const { PrismaLibSql } = await import('@prisma/adapter-libsql');
  return new PrismaLibSql({ url });
}

/** Şema dosyalarını Prisma'nın beklediği biçimde okur. */
export function readSchema(schemaPath = SCHEMA_PATH) {
  return { path: schemaPath, content: fs.readFileSync(schemaPath, 'utf8') };
}
