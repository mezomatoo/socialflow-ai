import { createMockPrisma } from './prisma-mock';

/**
 * Tek Prisma istemcisi. Next.js hot-reload sırasında bağlantı havuzunun
 * tükenmesini engellemek için globalThis üzerinde önbelleğe alınır.
 * Çevrimdışı / engine indirilemeyen ortamlarda otomatik olarak mock'a düşer.
 */
const globalForPrisma = globalThis as unknown as { prisma?: any };

function createPrismaClient(): any {
  try {
    const { PrismaClient } = require('@prisma/client');
    // PrismaClient constructor throws if client not generated — catch and fallback
    return new PrismaClient({
      log: process.env.APP_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn']
    });
  } catch (e) {
    console.warn('[prisma] Gerçek istemci başlatılamadı, mock kullanılıyor:', (e as Error).message);
    return createMockPrisma();
  }
}

function wrapWithFallback(client: any): any {
  // Proxy that falls back to mock on query failure (DB file missing / engine error)
  const mock = createMockPrisma();
  return new Proxy(client, {
    get(target: any, prop: string) {
      const orig = target[prop];
      if (typeof prop === 'string' && prop.startsWith('$')) {
        if (typeof orig === 'function') {
          return async (...args: any[]) => {
            try {
              return await orig.apply(target, args);
            } catch (err) {
              // @ts-ignore
              const fb = (mock as any)[prop];
              if (typeof fb === 'function') return fb.apply(mock, args);
              return null;
            }
          };
        }
        return orig;
      }
      // model delegate
      if (orig && typeof orig === 'object') {
        return new Proxy(orig, {
          get(delegateTarget: any, method: string) {
            const fn = delegateTarget[method];
            const mockDelegate: any = (mock as any)[prop];
            const mockFn: any = mockDelegate?.[method];
            if (typeof fn !== 'function') {
              if (typeof mockFn === 'function') return (...args: any[]) => mockFn.apply(mockDelegate, args);
              return fn;
            }
            return async (...args: any[]) => {
              try {
                return await fn.apply(delegateTarget, args);
              } catch (err) {
                if (typeof mockFn === 'function') return mockFn.apply(mockDelegate, args);
                // safe defaults
                if (method.startsWith('findMany')) return [];
                if (method === 'count') return 0;
                if (method.startsWith('find')) return null;
                return null;
              }
            };
          }
        });
      }
      // unknown delegate -> mock
      if (orig === undefined) {
        const mv = (mock as any)[prop];
        if (mv !== undefined) return mv;
      }
      return orig;
    }
  });
}

export const prisma: any = globalForPrisma.prisma ?? wrapWithFallback(createPrismaClient());

if (process.env.APP_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
