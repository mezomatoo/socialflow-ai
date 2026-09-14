import { apiRoute, ok, badRequest } from '@/lib/api';
import prisma from '@/lib/prisma';
import { scheduleContent } from '@/lib/services/schedulingService';

/** Takvim görünümü (gün/hafta/ay) + sürükle-bırak yeniden planlama. */
export const GET = apiRoute(async (request, { session }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) return badRequest('Başlangıç ve bitiş tarihi zorunludur.');

  const items = await prisma.platformContent.findMany({
    where: {
      content: { workspaceId: session.user.workspaceId },
      scheduledFor: { gte: new Date(from), lte: new Date(to) },
      enabled: true
    },
    orderBy: { scheduledFor: 'asc' },
    include: {
      socialAccount: { select: { handle: true, displayName: true } },
      mediaAsset: { select: { publicUrl: true, kind: true } },
      content: { select: { id: true, title: true, masterCaption: true, status: true, brandId: true, campaignId: true, brand: { select: { name: true, primaryColor: true } } } }
    }
  });

  return ok({
    items: items.map((i) => ({
      id: i.id,
      contentId: i.contentId,
      platform: i.platform,
      contentType: i.contentType,
      status: i.status,
      scheduledFor: i.scheduledFor,
      caption: i.caption || i.content.masterCaption,
      title: i.content.title,
      brand: i.content.brand,
      account: i.socialAccount ? `${i.socialAccount.displayName} ${i.socialAccount.handle}` : null,
      thumbnail: i.mediaAsset?.publicUrl ?? null,
      mediaKind: i.mediaAsset?.kind ?? null,
      lastError: i.lastError
    }))
  });
});

/** Sürükle-bırak: tek hedefi yeni zamana taşı. */
export const PATCH = apiRoute(
  async (request, { session }) => {
    const body = await request.json().catch(() => ({}));
    const platformContentId = String(body.platformContentId ?? '');
    const scheduledFor = body.scheduledFor ? new Date(String(body.scheduledFor)) : null;
    if (!platformContentId || !scheduledFor) return badRequest('Hedef ve yeni zaman zorunludur.');
    if (Number.isNaN(scheduledFor.getTime())) return badRequest('Tarih biçimi geçersiz.');

    const pc = await prisma.platformContent.findFirst({
      where: { id: platformContentId, content: { workspaceId: session.user.workspaceId } },
      include: { content: { select: { id: true, version: true } } }
    });
    if (!pc) return badRequest('İçerik bulunamadı.');

    const res = await scheduleContent({
      contentId: pc.contentId,
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      scheduledFor,
      timezone: 'Europe/Istanbul',
      targetIds: [platformContentId]
    });

    return ok(res);
  },
  { limit: 60 }
);
