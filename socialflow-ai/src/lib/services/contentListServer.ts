import prisma from '@/lib/prisma';
import { CONTENT_STATUS_LABELS } from '@/lib/platforms/platforms';
import type { ContentListItem } from '@/components/content/ContentListView';

/**
 * Liste sayfaları (taslaklar / planlananlar / yayınlananlar) için ortak
 * sunucu tarafı içerik sorgusu. İstemci bileşenine JSON-serialize edilebilir
 * sade bir şekil döndürür.
 */
export async function fetchContentList(
  workspaceId: string,
  statuses: string[]
): Promise<ContentListItem[]> {
  const rows = await prisma.content.findMany({
    where: { workspaceId, status: { in: statuses } },
    orderBy: [{ scheduledFor: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
    include: {
      brand: { select: { id: true, name: true, primaryColor: true, logoUrl: true } },
      media: { include: { media: { select: { id: true, publicUrl: true, kind: true, width: true, height: true } } } },
      platformContents: {
        where: { enabled: true },
        select: {
          id: true,
          platform: true,
          contentType: true,
          status: true,
          scheduledFor: true,
          lastError: true,
          charUsed: true,
          charLimit: true
        }
      }
    }
  });

  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    masterCaption: c.masterCaption,
    status: c.status,
    statusLabel: CONTENT_STATUS_LABELS[c.status as keyof typeof CONTENT_STATUS_LABELS] ?? c.status,
    brand: c.brand,
    media: c.media.map((m) => m.media),
    targets: c.platformContents.map((t) => ({
      ...t,
      scheduledFor: t.scheduledFor ? new Date(t.scheduledFor).toISOString() : null
    })),
    targetCount: c.platformContents.length,
    scheduledFor: c.scheduledFor ? new Date(c.scheduledFor).toISOString() : null,
    publishedAt: c.publishedAt ? new Date(c.publishedAt).toISOString() : null,
    createdAt: new Date(c.createdAt).toISOString(),
    updatedAt: new Date(c.updatedAt).toISOString(),
    version: c.version
  }));
}

export async function fetchBrandOptions(workspaceId: string) {
  return prisma.brand.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true }
  });
}
