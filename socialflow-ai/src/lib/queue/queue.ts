import prisma from '../prisma';
import type { JobType } from '../platforms/platforms';

/**
 * Kalıcı (durable) arka plan iş kuyruğu.
 * ---------------------------------------------------------------------------
 * İşler veritabanında tutulur; süreç yeniden başlasa bile kaybolmaz.
 * Üretimde BullMQ/Redis veya SQS'e taşınabilir — `enqueue` ve `processJob`
 * arayüzleri aynı kalır.
 *
 * İş türleri:
 *   PublishContentJob    — planlı yayınları yürütür
 *   MediaProcessingJob   — medya varyantlarını işler
 *   AnalyticsSyncJob     — platform analiz verilerini çeker
 *   TokenRefreshJob      — süresi dolmak üzere olan token'ları yeniler
 */

export interface EnqueueOptions {
  type: JobType | string;
  payload?: Record<string, unknown>;
  runAt?: Date;
  workspaceId?: string | null;
  /** Aynı anahtarlı iş varsa yeni iş oluşturulmaz (idempotency). */
  idempotencyKey: string;
  maxAttempts?: number;
}

export async function enqueue(opts: EnqueueOptions): Promise<{ id: string | null; created: boolean }> {
  const existing = await prisma.job.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
  if (existing) {
    // Zaten kuyrukta veya tamamlanmış; çift iş oluşturma.
    if (['DONE', 'CANCELLED'].includes(existing.status)) {
      return { id: existing.id, created: false };
    }
    return { id: existing.id, created: false };
  }

  const job = await prisma.job.create({
    data: {
      type: opts.type,
      payload: JSON.stringify(opts.payload ?? {}),
      runAt: opts.runAt ?? new Date(),
      workspaceId: opts.workspaceId ?? null,
      idempotencyKey: opts.idempotencyKey,
      maxAttempts: opts.maxAttempts ?? 3,
      status: 'QUEUED'
    }
  });
  return { id: job.id, created: true };
}

export async function cancelJob(idempotencyKey: string): Promise<boolean> {
  const res = await prisma.job.updateMany({
    where: { idempotencyKey, status: { in: ['QUEUED', 'FAILED'] } },
    data: { status: 'CANCELLED' }
  });
  return res.count > 0;
}

export async function rescheduleJob(idempotencyKey: string, runAt: Date): Promise<boolean> {
  const res = await prisma.job.updateMany({
    where: { idempotencyKey, status: { in: ['QUEUED', 'FAILED', 'CANCELLED'] } },
    data: { runAt, status: 'QUEUED', attempts: 0, lastError: null }
  });
  return res.count > 0;
}

/** Kilitle-al (claim) — çoklu süreç güvenliği için koşullu güncelleme. */
export async function claimNextJob(workerId: string): Promise<any | null> {
  const now = new Date();
  const stale = new Date(Date.now() - 5 * 60_000);

  const candidate = await prisma.job.findFirst({
    where: {
      status: 'QUEUED',
      runAt: { lte: now },
      attempts: { lt: 10 }
    },
    orderBy: { runAt: 'asc' }
  });
  if (!candidate) {
    // Takılı kalmış RUNNING işleri kurtar
    await prisma.job.updateMany({
      where: { status: 'RUNNING', lockedAt: { lt: stale } },
      data: { status: 'QUEUED', lockedBy: null, lockedAt: null }
    });
    return null;
  }

  const claimed = await prisma.job.updateMany({
    where: { id: candidate.id, status: 'QUEUED' },
    data: { status: 'RUNNING', lockedBy: workerId, lockedAt: now, attempts: { increment: 1 } }
  });
  if (claimed.count === 0) return null;

  return prisma.job.findUnique({ where: { id: candidate.id } });
}

export async function completeJob(id: string, result?: Record<string, unknown>) {
  await prisma.job.update({
    where: { id },
    data: { status: 'DONE', result: result ? JSON.stringify(result) : null, lockedBy: null, lockedAt: null }
  });
}

export async function failJob(id: string, error: string, retryDelayMs = 60_000) {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return;
  const willRetry = job.attempts < job.maxAttempts;
  await prisma.job.update({
    where: { id },
    data: {
      status: willRetry ? 'QUEUED' : 'FAILED',
      lastError: error.slice(0, 500),
      runAt: willRetry ? new Date(Date.now() + retryDelayMs * job.attempts) : job.runAt,
      lockedBy: null,
      lockedAt: null
    }
  });
}

export async function listJobs(filter: { status?: string; type?: string; limit?: number } = {}) {
  return prisma.job.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.type ? { type: filter.type } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: filter.limit ?? 50
  });
}
