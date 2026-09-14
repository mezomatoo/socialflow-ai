import { PrismaClient } from '@prisma/client';

/**
 * Tek Prisma istemcisi. Next.js hot-reload sırasında bağlantı havuzunun
 * tükenmesini engellemek için globalThis üzerinde önbelleğe alınır.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.APP_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn']
  });

if (process.env.APP_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
