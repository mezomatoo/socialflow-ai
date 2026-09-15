import prisma from '@/lib/prisma';
import { apiRoute, fail, ok } from '@/lib/api';
import { logger } from '@/lib/observability';

/**
 * Üretim sağlık kontrolü — READINESS (§56, §115)
 * ---------------------------------------------------------------------------
 * Kritik bağımlılıkların GERÇEK durumunu denetler. Sahte yeşil durum YOKTUR:
 * veritabanı erişilemezse 503 + `unavailable` döner (§13 — hata sahte veriyle
 * gizlenmez). Denetimler ucuz tutulur (SELECT 1); ağır kontroller yapılmaz.
 *
 * Yetki gerektirmez (dış izleme için); hız sınırı korunur.
 */

const CHECK_TIMEOUT_MS = 2_000;

async function checkDatabase(): Promise<boolean> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('zaman aşımı')), CHECK_TIMEOUT_MS))
    ]);
    return true;
  } catch (err) {
    logger.warn({ event: 'health.db_unavailable', errorMessage: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

export const GET = apiRoute(
  async () => {
    const db = await checkDatabase();
    if (!db) {
      return fail('SERVICE_UNAVAILABLE', 'Veritabanı şu anda erişilemez. Servis hazır değil.', 503, {
        checks: { database: false }
      });
    }
    return ok({
      status: 'ready' as const,
      checks: { database: true },
      time: new Date().toISOString()
    });
  },
  { auth: false, csrf: false, limit: 60, windowMs: 60_000 }
);
