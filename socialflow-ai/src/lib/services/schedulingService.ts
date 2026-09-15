import prisma from '../prisma';
import { enqueue, cancelJob, rescheduleJob } from '../queue/queue';
import { notify } from './notifications';
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from '../format';
import { PLATFORM_META } from '../platforms/platforms';

/**
 * SchedulingService — planlama mimarisi.
 * ---------------------------------------------------------------------------
 * Her PlatformContent için bir `Schedule` kaydı ve buna bağlı kalıcı bir
 * `PublishContentJob` oluşturulur. Kuyruk işçisi vakti gelen işi yürütür.
 * Zamanlama DEĞİŞTİRİLDİĞİNDE aynı idempotency anahtarı kullanılarak iş
 * yeniden planlanır — çift gönderim oluşmaz.
 */

export function publishJobKey(platformContentId: string, version = 1): string {
  return `publish:${platformContentId}:v${version}`;
}

export async function enqueuePublishJob(params: {
  platformContentId: string;
  contentId: string;
  workspaceId?: string | null;
  runAt?: Date;
  userId?: string | null;
  version?: number;
}) {
  const key = publishJobKey(params.platformContentId, params.version ?? 1);
  const { id, created } = await enqueue({
    type: 'PublishContentJob',
    idempotencyKey: key,
    runAt: params.runAt ?? new Date(),
    workspaceId: params.workspaceId ?? null,
    payload: {
      platformContentId: params.platformContentId,
      contentId: params.contentId,
      userId: params.userId ?? null
    }
  });
  return { id, created, key };
}

export interface ScheduleTarget {
  platformContentId: string;
  scheduledFor: Date; // UTC
}

/** İçeriğin tüm (veya seçili) hedeflerini planlar. */
export async function scheduleContent(params: {
  contentId: string;
  workspaceId: string;
  userId?: string | null;
  scheduledFor: Date;
  timezone?: string;
  targetIds?: string[];
  aiSuggested?: boolean;
}) {
  const { contentId, workspaceId, scheduledFor, timezone = DEFAULT_TIMEZONE } = params;

  const content = await prisma.content.findUnique({ where: { id: contentId }, include: { brand: true } });
  if (!content) throw new Error('İçerik bulunamadı.');

  const targets = await prisma.platformContent.findMany({
    where: {
      contentId,
      enabled: true,
      ...(params.targetIds?.length ? { id: { in: params.targetIds } } : {})
    }
  });
  if (!targets.length) throw new Error('Planlanacak hedef seçilmedi.');

  for (const t of targets) {
    await prisma.platformContent.update({
      where: { id: t.id },
      data: { status: 'SCHEDULED', scheduledFor, lastError: null, updatedAt: new Date() }
    });

    await prisma.schedule.upsert({
      where: { platformContentId: t.id },
      create: {
        contentId,
        platformContentId: t.id,
        scheduledFor,
        timezone,
        status: 'PENDING',
        aiSuggested: params.aiSuggested ?? false
      },
      update: { scheduledFor, timezone, status: 'PENDING', aiSuggested: params.aiSuggested ?? false }
    });

    // Aynı idempotency anahtarıyla işi yeniden planla
    const key = publishJobKey(t.id, content.version);
    const moved = await rescheduleJob(key, scheduledFor);
    if (!moved) {
      await enqueuePublishJob({
        platformContentId: t.id,
        contentId,
        workspaceId,
        runAt: scheduledFor,
        userId: params.userId ?? null,
        version: content.version
      });
    }
  }

  await prisma.content.update({
    where: { id: contentId },
    data: { status: 'SCHEDULED', scheduleMode: 'SCHEDULE', scheduledFor, timezone }
  });

  const platformNames = Array.from(new Set(targets.map((t) => PLATFORM_META[t.platform as keyof typeof PLATFORM_META]?.name ?? t.platform))).join(', ');

  await notify(workspaceId, {
    type: 'SCHEDULED',
    severity: 'SUCCESS',
    title: 'İçerik planlandı',
    message: `${targets.length} yayın planlandı (${platformNames}). Zaman: ${formatTr(scheduledFor, timezone)}`,
    contentId,
    userId: params.userId ?? null,
    actionLabel: 'Takvimi Aç',
    actionRoute: '/app/takvim'
  });

  return { scheduled: targets.length, scheduledFor };
}

/** Planlamayı iptal eder ve taslağa döndürür. */
export async function cancelSchedule(params: { contentId: string; workspaceId: string; targetIds?: string[] }) {
  const content = await prisma.content.findUnique({ where: { id: params.contentId } });
  if (!content) throw new Error('İçerik bulunamadı.');

  const targets = await prisma.platformContent.findMany({
    where: {
      contentId: params.contentId,
      ...(params.targetIds?.length ? { id: { in: params.targetIds } } : {}),
      status: { in: ['SCHEDULED', 'PUBLISHING'] }
    }
  });

  for (const t of targets) {
    await cancelJob(publishJobKey(t.id, content.version));
    await prisma.platformContent.update({
      where: { id: t.id },
      data: { status: 'DRAFT', scheduledFor: null, updatedAt: new Date() }
    });
    await prisma.schedule.updateMany({
      where: { platformContentId: t.id },
      data: { status: 'CANCELLED' }
    });
  }

  const remaining = await prisma.platformContent.count({
    where: { contentId: params.contentId, status: 'SCHEDULED' }
  });
  await prisma.content.update({
    where: { id: params.contentId },
    data: {
      status: remaining > 0 ? 'SCHEDULED' : 'DRAFT',
      scheduleMode: remaining > 0 ? 'SCHEDULE' : 'DRAFT',
      scheduledFor: remaining > 0 ? content.scheduledFor : null
    }
  });

  return { cancelled: targets.length };
}

/** "Bugün saat 18:00 için 3 paylaşımınız bulunuyor." tarzı hatırlatmalar. */
export async function createUpcomingReminders(workspaceId: string, timezone = DEFAULT_TIMEZONE) {
  const from = new Date();
  const to = new Date(Date.now() + 12 * 3600_000);
  const upcoming = await prisma.schedule.findMany({
    where: {
      status: { in: ['PENDING', 'QUEUED'] },
      scheduledFor: { gte: from, lte: to },
      content: { workspaceId }
    },
    include: { platformContent: { select: { platform: true } } }
  });
  if (!upcoming.length) return 0;

  await notify(workspaceId, {
    type: 'REMINDER',
    severity: 'INFO',
    title: 'Yaklaşan paylaşımlar',
    message: `Önümüzdeki 12 saat içinde ${upcoming.length} paylaşımınız planlandı. İlk yayın: ${formatTr(
      upcoming[0].scheduledFor,
      timezone
    )}.`,
    actionLabel: 'Takvimi Aç',
    actionRoute: '/app/takvim'
  });
  return upcoming.length;
}

function formatTr(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz
  }).format(date);
}

export { zonedTimeToUtc };
