import { processInboxEvent } from '../inbox/service';
import { claimNextJob, completeJob, failJob } from './queue';
import { publishPlatformContent, rollupContentStatus } from '../social/publishingService';
import prisma from '../prisma';
import { env } from '../env';
import { getProvider } from '../social/registry';
import { fromCipherText, toCipherText } from '../crypto';
import { notify } from '../services/notifications';
import { audit } from '../security/audit';
import { enqueuePublishJob } from '../services/schedulingService';
import { enqueue } from './queue';

/**
 * İş yürütücüleri (job handlers) + kuyruk işçisi.
 * Next.js instrumentation.ts içinde tek bir örnek (singleton) başlatılır.
 */

export async function processJob(job: any): Promise<Record<string, unknown> | void> {
  const payload = safeParse(job.payload);

  switch (job.type) {
    case 'InboxEventJob':
      if (!job.workspaceId || typeof payload.eventId !== 'string') throw new Error('Geçersiz gelen kutusu işi.');
      try { return await processInboxEvent(job.workspaceId, payload.eventId); }
      catch { throw new Error('Gelen kutusu olayı işlenemedi. Kaynak ve hesap yetkilerini kontrol edin.'); }
    case 'PublishContentJob':
      return handlePublishContentJob(job, payload);
    case 'SyncPublicationStatusJob':
      return handleSyncPublicationStatusJob(job, payload);
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

/**
 * Faz 2 (§51): sağlayıcı isteği kabul edip PLATFORM TARAFINDA işliyorsa
 * (ör. video transcode) Publication PROCESSING kalır. Bu iş, sağlayıcıdan
 * son durumu çekerek PUBLISHED/FAILED'e çevirir. Kendini yeniden planlar;
 * terminal duruma ulaşınca veya kontrol sınırına (15 kontrol, üstel artan
 * aralıkla) gelince durur — sonsuz döngü yoktur (§79 ruhunda).
 */
async function handleSyncPublicationStatusJob(_job: any, payload: any) {
  const publicationId: string = payload.publicationId;
  const check: number = Number(payload.check ?? 1);
  const MAX_CHECKS = 15;

  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: {
      platformContent: {
        include: {
          content: { select: { workspaceId: true, title: true } },
          socialAccount: { include: { token: true } }
        }
      }
    }
  });
  if (!publication) return;
  if (publication.status !== 'PROCESSING') return; // zaten terminal durumda

  const pc = publication.platformContent;
  const workspaceId = pc.content.workspaceId;
  const token = pc.socialAccount?.token ? fromCipherText(pc.socialAccount.token.accessTokenEnc) : null;
  const provider = getProvider(pc.platform);

  let status: 'PUBLISHED' | 'PENDING' | 'PROCESSING' | 'FAILED' | 'UNKNOWN' = 'UNKNOWN';
  let permalink: string | null = null;
  let message: string | null = null;

  try {
    if (!publication.providerPostId) throw new Error('Sağlayıcı gönderi kimliği yok.');
    const result = await provider.getPostStatus(publication.providerPostId, token ?? '');
    status = result.status;
    permalink = result.permalink ?? null;
    message = result.message ?? null;
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
    status = 'UNKNOWN';
  }

  await prisma.publication.update({ where: { id: publication.id }, data: { providerStatusCheckedAt: new Date() } });

  if (status === 'PUBLISHED') {
    await prisma.publication.update({
      where: { id: publication.id },
      data: {
        status: 'PUBLISHED',
        permalink: permalink ?? publication.permalink,
        publishedAt: publication.publishedAt ?? new Date(),
        lastError: null
      }
    });
    await prisma.platformContent.update({
      where: { id: pc.id },
      data: { status: 'PUBLISHED', permalink: permalink ?? pc.permalink, publishedAt: new Date(), lastError: null, updatedAt: new Date() }
    });
    await notify(workspaceId, {
      type: 'PUBLISHED',
      severity: 'SUCCESS',
      title: 'Platform işleme tamamlandı',
      message: `${pc.content.title || 'İçerik'} platformda yayına alındı.`,
      contentId: pc.contentId,
      actionLabel: permalink ? 'Gönderiyi Görüntüle' : 'Yayınlananlar',
      actionRoute: permalink ?? '/app/icerik/yayinlananlar'
    });
    await audit({ workspaceId, action: 'publication.success', entityType: 'PlatformContent', entityId: pc.id, metadata: { syncCheck: check } });
    await rollupContentStatus(pc.contentId);
    return { status: 'PUBLISHED', check };
  }

  if (status === 'FAILED') {
    const friendly = 'Platform, içeriği işlerken hata bildirdi. İçeriği yeniden deneyebilirsiniz.';
    await prisma.publication.update({
      where: { id: publication.id },
      data: { status: 'FAILED', lastError: friendly, normalizedErrorCode: 'PROVIDER_TEMPORARY_ERROR' }
    });
    await prisma.platformContent.update({
      where: { id: pc.id },
      data: { status: 'FAILED', lastError: friendly, updatedAt: new Date() }
    });
    await notify(workspaceId, {
      type: 'PUBLISH_FAILED',
      severity: 'ERROR',
      title: 'Platform işleme tamamlayamadı',
      message: message ? `${friendly} (Detay: ${String(message).slice(0, 160)})` : friendly,
      contentId: pc.contentId,
      actionLabel: 'Yayınlananlar',
      actionRoute: '/app/icerik/yayinlananlar'
    });
    await audit({ workspaceId, action: 'publication.failed', entityType: 'PlatformContent', entityId: pc.id, metadata: { syncCheck: check, providerMessage: message } });
    await rollupContentStatus(pc.contentId);
    return { status: 'FAILED', check };
  }

  // Hâlâ işleniyor veya durum bilinmiyor → sınır içinde tekrar kontrol et
  if (check < MAX_CHECKS) {
    const backoffMs = Math.min(120_000 * Math.pow(2, check - 1), 30 * 60_000);
    await enqueue({
      type: 'SyncPublicationStatusJob',
      idempotencyKey: `pubsync:${publication.id}:${check + 1}`,
      runAt: new Date(Date.now() + backoffMs),
      workspaceId,
      maxAttempts: 1,
      payload: { publicationId: publication.id, check: check + 1 }
    });
    return { status, check, nextCheck: check + 1 };
  }

  // Kontrol sınırı aşıldı → dürüstçe başarısız işaretle (sonsuz bekleme yok)
  const timeoutMessage = 'Platform, içerik işleme işlemini beklenen sürede tamamlamadı. Lütfen platformda gönderinin durumunu kontrol edin.';
  await prisma.publication.update({
    where: { id: publication.id },
    data: { status: 'FAILED', lastError: timeoutMessage, normalizedErrorCode: 'UNKNOWN_PROVIDER_ERROR' }
  });
  await prisma.platformContent.update({
    where: { id: pc.id },
    data: { status: 'FAILED', lastError: timeoutMessage, updatedAt: new Date() }
  });
  await notify(workspaceId, {
    type: 'PUBLISH_FAILED',
    severity: 'WARNING',
    title: 'Yayın durumu doğrulanamadı',
    message: timeoutMessage,
    contentId: pc.contentId,
    actionLabel: 'Yayınlananlar',
    actionRoute: '/app/icerik/yayinlananlar'
  });
  await rollupContentStatus(pc.contentId);
  return { status: 'TIMEOUT', check };
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
        actionRoute: '/app/hesaplar'
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
