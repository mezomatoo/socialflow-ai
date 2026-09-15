/**
 * Prisma istemcisi.
 * ---------------------------------------------------------------------------
 * Prisma 7 sürücü adaptörleriyle çalışır; sorgu derleyicisi (query compiler)
 * WASM olarak gelir, ikili (native) motor indirilmez.
 *
 *   file:/libsql:  → @prisma/adapter-libsql
 *   postgres://     → @prisma/adapter-pg
 *
 * Next.js hot-reload sırasında bağlantı havuzunun tükenmemesi için istemci
 * globalThis üzerinde önbelleğe alınır.
 */
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaPg } from '@prisma/adapter-pg';
import type { SqlDriverAdapterFactory } from '@prisma/driver-adapter-utils';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaAdapter?: SqlDriverAdapterFactory;
};

function databaseUrl(): string {
  return process.env.DATABASE_URL || 'file:./prisma/dev.db';
}

/** Adrese göre sürücü adaptörü üretir (tek sefer). */
function adapterFactory(): SqlDriverAdapterFactory {
  if (globalForPrisma.prismaAdapter) return globalForPrisma.prismaAdapter;
  const url = databaseUrl();

  const adapter: SqlDriverAdapterFactory = /^postgres(ql)?:\/\//i.test(url)
    ? new PrismaPg({ connectionString: url })
    : new PrismaLibSql({ url });

  globalForPrisma.prismaAdapter = adapter;
  return adapter;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: adapterFactory(),
    log: ['error', 'warn']
  });

if (process.env.APP_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
