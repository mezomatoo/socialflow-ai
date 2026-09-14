/**
 * Basit, süreç içi hız sınırlayıcı (rate limiter).
 * Üretimde Redis/Upstash gibi paylaşılan bir depoya taşınmalıdır; arayüz aynıdır.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

let sweepTimer: NodeJS.Timeout | null = null;
function ensureSweeper() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }, 60_000);
  // Sunucu kapanışını engellemesin
  if (typeof sweepTimer === 'object' && 'unref' in sweepTimer) sweepTimer.unref();
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

export function rateLimit(key: string, limit = 120, windowMs = 60_000): RateLimitResult {
  ensureSweeper();
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, limit, resetAt: now + windowMs };
  }
  existing.count += 1;
  return {
    ok: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    limit,
    resetAt: existing.resetAt
  };
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(Math.ceil(r.resetAt / 1000))
  };
}
