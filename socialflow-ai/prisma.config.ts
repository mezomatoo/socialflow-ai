/**
 * Prisma yapılandırması (Prisma 7).
 * ---------------------------------------------------------------------------
 * Prisma 7 ile bağlantı adresi şema dosyasında değil burada tutulur ve
 * uygulama, sürücü adaptörleri (driver adapter) ile veritabanına bağlanır:
 *
 *   - `file:` / `libsql:` → @prisma/adapter-libsql   (yerel geliştirme, demo)
 *   - `postgres(ql)://`   → @prisma/adapter-pg       (üretim: PostgreSQL)
 *
 * `datasource.url` yalnızca CLI komutları (db push / migrate / introspect)
 * içindir; uygulama bağlantısı `src/lib/prisma.ts` içinde kurulur.
 */
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

function loadEnvFile() {
  const file = path.join(process.cwd(), '.env');
  try {
    if (fs.existsSync(file) && typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(file);
    }
  } catch {
    // .env okunamazsa ortam değişkenleri kullanılır.
  }
}

loadEnvFile();

const databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations')
  },
  datasource: {
    url: databaseUrl
  }
});
