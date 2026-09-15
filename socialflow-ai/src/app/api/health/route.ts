import { NextResponse } from 'next/server';
import { apiRoute, ok } from '@/lib/api';
import { env } from '@/lib/env';

/**
 * Üretim sağlık kontrolü — LIVENESS (§56)
 * ---------------------------------------------------------------------------
 * İşlem ayakta mı? Sorusunu yanıtlar. BAĞIMLILIK KONTROLÜ YAPMAZ (pahalı yük
 * yaratmaz); veritabanı/depolama durumu için /api/health/ready kullanılır.
 * Sahte "yeşil" durum üretilmez: bu uç yalnızca sürecin canlılığını bildirir.
 *
 * Yetki gerektirmez (dış izleme/sentetik kontrol için); hız sınırı ile
 * kötüye kullanıma karşı korunur.
 */

export const GET = apiRoute(
  async () => {
    return ok({
      status: 'ok' as const,
      env: env.isProduction ? ('production' as const) : ('non-production' as const),
      time: new Date().toISOString()
    });
  },
  { auth: false, csrf: false, limit: 60, windowMs: 60_000 }
);

/** HEAD istekleri için NextResponse döndüren minimal yol (izleme araçları için). */
export function HEAD(): NextResponse {
  return new NextResponse(null, { status: 200 });
}
