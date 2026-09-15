import { apiRoute, ok } from '@/lib/api';
import prisma from '@/lib/prisma';
import { CONTENT_STATUS_LABELS } from '@/lib/platforms/platforms';

/** Genel arama: içerik, kampanya, açıklama, hashtag, marka, medya. */
export const GET = apiRoute(async (request, { session }) => {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return ok({ contents: [], brands: [], media: [], campaigns: [], hashtags: [] });
  const workspaceId = session.user.workspaceId;

  const [contents, brands, media, campaigns, hashtagEntries, accounts] = await Promise.all([
    prisma.content.findMany({
      where: {
        workspaceId,
        OR: [{ masterCaption: { contains: q } }, { title: { contains: q } }, { storyText: { contains: q } }]
      },
      take: 8,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, masterCaption: true, status: true, scheduledFor: true, updatedAt: true }
    }),
    prisma.brand.findMany({ where: { workspaceId, name: { contains: q } }, take: 5, select: { id: true, name: true, website: true } }),
    prisma.mediaAsset.findMany({
      where: { workspaceId, OR: [{ originalName: { contains: q } }, { tags: { contains: q } }, { campaign: { contains: q } }] },
      take: 6,
      select: { id: true, originalName: true, kind: true, format: true, publicUrl: true }
    }),
    prisma.campaign.findMany({ where: { workspaceId, OR: [{ name: { contains: q } }, { code: { contains: q } }] }, take: 5 }),
    prisma.hashtagEntry.findMany({ where: { workspaceId, tag: { contains: q.replace('#', '') } }, take: 8 }),
    prisma.socialAccount.findMany({
      where: { workspaceId, OR: [{ handle: { contains: q } }, { displayName: { contains: q } }] },
      take: 5,
      select: { id: true, handle: true, displayName: true, platform: true }
    })
  ]);

  return ok({
    contents: contents.map((c) => ({
      id: c.id,
      title: c.title,
      masterCaption: c.masterCaption,
      status: c.status,
      statusLabel: CONTENT_STATUS_LABELS[c.status as keyof typeof CONTENT_STATUS_LABELS] ?? c.status,
      scheduledFor: c.scheduledFor,
      updatedAt: c.updatedAt
    })),
    brands,
    media,
    campaigns,
    accounts,
    hashtags: hashtagEntries.map((h) => ({ tag: h.tag, group: h.group, blocked: h.blocked }))
  });
});
