import { claimNextJob, completeJob, failJob } from './queue';
import { publishPlatformContent, rollupContentStatus } from '../social/publishingService';
import prisma from '../prisma';
import { env } from '../env';
import { getProvider } from '../social/registry';
import { fromCipherText, toCipherText } from '../crypto';
import { notify } from '../services/notifications';
import { enqueuePublishJob } from '../services/schedulingService';

/**
 * İş yürütücüleri (job handlers) + kuyruk işçisi.
 * Next.js instrumentation.ts içinde tek bir örnek (singleton) başlatılır.
 */

export async function processJob(job: any): Promise<Record<string, unknown> | void> {
  const payload = safeParse(job.payload);

  switch (job.type) {
    case 'PublishContentJob':
      return handlePublishContentJob(job, payload);
    case 'MediaProcessingJob':
      return handleMediaProcessingJob(job, payload);
    case 'AnalyticsSyncJob':
      return handleAnalyticsSyncJob(job, payload);
    case 'TokenRefreshJob':
      return handleTokenRefreshJob(job, payload);
    default:
      throw new Error(`Bilinmeyen iş türü: ${job.type}`);
  }
}

async function handlePublishContentJob(job: any, payload: any) {
  const platformContentId: string = payload.platformContentId;
  const contentId: string = payload.contentId;
  if (!platformContentId) throw new Error('platformContentId eksik.');

  const pc = await prisma.platformContent.findUnique({
    where: { id: platformContentId },
    include: { content: { select: { workspaceId: true } } }
  });
  if (!pc) {
    await prisma.job.update({ where: { id: job.id }, data: { status: 'CANCELLED', lastError: 'Hedef bulunamadı.' } });
    return;
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: pc.content.workspaceId } });
  const result = await publishPlatformContent(platformContentId, {
    workspaceId: pc.content.workspaceId,
    userId: payload.userId ?? null,
    demoMode: workspace?.demoMode ?? env.demoMode
  });

  // Zamanlama kaydını güncelle
  await prisma.schedule.updateMany({
    where: { platformContentId },
    data: { status: result.ok ? 'DONE' : 'FAILED' }
  });

  if (!result.ok && result.retryable) {
    throw new Error(result.message); // kuyruk tekrar deneyecek
  }
  return { ok: result.ok, status: result.status, contentId };
}

async function handleMediaProcessingJob(_job: any, payload: any) {
  const mediaId: string = payload.mediaId;
  if (!mediaId) throw new Error('mediaId eksik.');
  const media = await prisma.mediaAsset.findUnique({ where: { id: mediaId } });
  if (!media) return;

  // Sunucu tarafı yeniden işleme hattı (ör. sharp) buraya takılır.
  // Şu an varyantlar istemcide üretilip yükleniyor; bu iş yalnızca
  // analiz meta verisini hazır işaretler.
  await prisma.mediaAsset.update({
    where: { id: mediaId },
    data: { status: 'READY' }
  });
  return { mediaId, status: 'READY' };
}

async function handleAnalyticsSyncJob(_job: any, payload: any) {
  const workspaceId: string = payload.workspaceId;
  if (!workspaceId) throw new Error('workspaceId eksik.');

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (workspace?.demoMode) {
    // Sahte analitik ÜRETMEYİZ.
    return { skipped: true, reason: 'Demo modu — gerçek analitik verisi yok.' };
  }

  const published = await prisma.platformContent.findMany({
    where: { content: { workspaceId }, status: 'PUBLISHED', externalPostId: { not: null } },
    include: { socialAccount: { include: { token: true } } },
    take: 100
  });

  let synced = 0;
  for (const pc of published) {
    if (!pc.socialAccount?.token || !pc.externalPostId) continue;
    try {
      const provider = getProvider(pc.platform);
      const token = fromCipherText(pc.socialAccount.token.accessTokenEnc);
      const stats = await provider.getAnalytics(pc.externalPostId, token);
      if (!stats) continue;
      const date = new Date(new Date().toISOString().slice(0, 10));
      await prisma.analyticsSnapshot.create({
        data: {
          workspaceId,
          platformContentId: pc.id,
          contentId: pc.contentId,
          brandId: null,
          platform: pc.platform,
          accountHandle: pc.socialAccount.handle,
          date,
          impressions: stats.impressions,
          reach: stats.reach,
          likes: stats.likes,
          comments: stats.comments,
          shares: stats.shares,
          saves: stats.saves,
          clicks: stats.clicks,
          videoViews: stats.videoViews,
          engagementRate: stats.engagementRate,
          followerDelta: stats.followerDelta,
          source: 'API'
        }
      });
      synced++;
    } catch (err) {
      console.error('[AnalyticsSyncJob]', pc.id, err);
    }
  }
  return { synced };
}

async function handleTokenRefreshJob(_job: any, payload: any) {
  const accountId: string = payload.accountId;
  const accounts = accountId
    ? await prisma.socialAccount.findMany({ where: { id: accountId }, include: { token: true } })
    : await prisma.socialAccount.findMany({
        where: {
          token: {
            expiresAt: { lte: new Date(Date.now() + 24 * 3600_000) }
          },
          connectionStatus: 'ACTIVE'
        },
        include: { token: true }
      });

  let refreshed = 0;
  for (const account of accounts) {
    if (!account.token) continue;
    try {
      const provider = getProvider(account.platform);
      const accessToken = fromCipherText(account.token.accessTokenEnc);
      const refreshToken = account.token.refreshTokenEnc
        ? fromCipherText(account.token.refreshTokenEnc)
        : null;

      const next = await provider.refreshToken({ accessToken, refreshToken });
      const expiresAt = next.expiresIn ? new Date(Date.now() + (next.expiresIn - 60) * 1000) : null;

      await prisma.socialProviderToken.update({
        where: { id: account.token.id },
        data: {
          accessTokenEnc: toCipherText(next.accessToken),
          refreshTokenEnc: next.refreshToken ? toCipherText(next.refreshToken) : account.token.refreshTokenEnc,
          expiresAt,
          lastRefreshedAt: new Date()
        }
      });
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { connectionStatus: 'ACTIVE', lastValidatedAt: new Date(), lastError: null }
      });
      refreshed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          connectionStatus: 'NEEDS_REAUTH',
          lastError: `${account.displayName} bağlantısının yenilenmesi gerekiyor. Hesabı yeniden bağlayın.`
        }
      });
      await notify(account.workspaceId, {
        type: 'ACCOUNT_REAUTH',
        severity: 'WARNING',
        title: 'Hesap bağlantısı yenilenmeli',
        message: `${account.displayName} (${account.handle}) hesabının bağlantısının yenilenmesi gerekiyor.`,
        actionLabel: 'Hesabı Yeniden Bağla',
        actionRoute: '/sosyal-hesaplar'
      });
      console.error('[TokenRefreshJob]', account.id, message);
    }
  }
  return { refreshed, checked: accounts.length };
}

function safeParse(raw: string): any {
  try {
    return JSON.parse(raw ?? '{}');
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// İşçi (worker) döngüsü
// ---------------------------------------------------------------------------

let workerStarted = false;
let timer: NodeJS.Timeout | null = null;

export function startQueueWorker() {
  if (workerStarted) return;
  workerStarted = true;
  const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const interval = Math.max(2000, env.queue.pollIntervalMs);

  const tick = async () => {
    try {
      // Zamanlanmış içerikler için iş kuyruğa alındı mı?
      await ensureDueSchedules();

      for (let i = 0; i < env.queue.concurrency; i++) {
        const job = await claimNextJob(workerId);
        if (!job) break;
        try {
          const result = await processJob(job);
          await completeJob(job.id, (result as Record<string, unknown>) ?? undefined);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await failJob(job.id, message);
        }
      }
    } catch (err) {
      console.error('[queue] döngü hatası', err);
    }
  };

  timer = setInterval(() => {
    void tick();
  }, interval);
  if (timer && typeof timer === 'object' && 'unref' in timer) timer.unref();
  void tick();
}

export function stopQueueWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  workerStarted = false;
}

/** Vakti gelen Schedule kayıtları için PublishContentJob oluşturur. */
async function ensureDueSchedules() {
  const due = await prisma.schedule.findMany({
    where: { status: { in: ['PENDING', 'QUEUED'] }, scheduledFor: { lte: new Date() } },
    take: 25,
    include: { platformContent: { select: { contentId: true, status: true } } }
  });
  for (const s of due) {
    if (s.platformContent.status === 'PUBLISHED') {
      await prisma.schedule.update({ where: { id: s.id }, data: { status: 'DONE' } }).catch(() => undefined);
      continue;
    }
    await prisma.schedule.update({ where: { id: s.id }, data: { status: 'QUEUED', jobId: s.jobId } }).catch(() => undefined);
    await enqueuePublishJob({
      platformContentId: s.platformContentId,
      contentId: s.contentId,
      workspaceId: null
    }).catch((err) => console.error('[queue] zamanlama kuyruğa alınamadı', err));
  }
}
