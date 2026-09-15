import { apiRoute, ok, badRequest } from '@/lib/api';
import prisma from '@/lib/prisma';
import { createContent } from '@/lib/services/contentService';
import { CONTENT_STATUS_LABELS } from '@/lib/platforms/platforms';
import { audit } from '@/lib/security/audit';

/** İçerik listesi (taslaklar / planlananlar / yayınlananlar filtreleri). */
export const GET = apiRoute(async (request, { session }) => {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const brandId = url.searchParams.get('brandId');
  const platform = url.searchParams.get('platform');
  const q = url.searchParams.get('q');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const take = Math.min(200, Number(url.searchParams.get('limit') ?? 60));

  const where: any = { workspaceId: session.user.workspaceId };
  if (status) {
    const list = status.split(',').filter(Boolean);
    where.status = list.length > 1 ? { in: list } : list[0];
  }
  if (brandId) where.brandId = brandId;
  if (platform) where.platformContents = { some: { platform, enabled: true } };
  if (q) {
    where.OR = [{ masterCaption: { contains: q } }, { title: { contains: q } }];
  }
  if (from || to) {
    where.scheduledFor = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {})
    };
  }

  const items = await prisma.content.findMany({
    where,
    orderBy: [{ scheduledFor: 'desc' }, { updatedAt: 'desc' }],
    take,
    include: {
      brand: { select: { id: true, name: true, primaryColor: true, logoUrl: true } },
      media: { include: { media: { select: { id: true, publicUrl: true, kind: true, width: true, height: true } } } },
      platformContents: {
        where: { enabled: true },
        select: { id: true, platform: true, contentType: true, status: true, scheduledFor: true, lastError: true, charUsed: true, charLimit: true }
      },
      _count: { select: { platformContents: true } }
    }
  });

  return ok({
    items: items.map((c) => ({
      id: c.id,
      title: c.title,
      masterCaption: c.masterCaption,
      status: c.status,
      statusLabel: CONTENT_STATUS_LABELS[c.status as keyof typeof CONTENT_STATUS_LABELS] ?? c.status,
      brand: c.brand,
      media: c.media.map((m) => m.media),
      targets: c.platformContents,
      targetCount: c.platformContents.length,
      scheduledFor: c.scheduledFor,
      publishedAt: c.publishedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      version: c.version
    }))
  });
});

/** Yeni içerik oluşturur. */
export const POST = apiRoute(
  async (request, { session }) => {
    const body = await request.json().catch(() => ({}));
    if (!body.brandId) return badRequest('Marka profili seçilmedi.');

    const content = await createContent({
      workspaceId: session.user.workspaceId,
      brandId: String(body.brandId),
      userId: session.user.id,
      campaignId: body.campaignId ? String(body.campaignId) : null,
      title: body.title ? String(body.title) : null,
      masterCaption: String(body.masterCaption ?? ''),
      storyText: body.storyText ? String(body.storyText) : null,
      linkUrl: body.linkUrl ? String(body.linkUrl) : null,
      utm: body.utm ?? null,
      defaultStyle: body.defaultStyle ? String(body.defaultStyle) : undefined,
      defaultCta: body.defaultCta ? String(body.defaultCta) : null,
      hashtagPlacement: body.hashtagPlacement ?? 'INLINE',
      mediaIds: Array.isArray(body.mediaIds) ? body.mediaIds.map(String) : [],
      selections: Array.isArray(body.selections)
        ? body.selections.map((s: any) => ({ platform: String(s.platform), contentType: String(s.contentType), accountId: s.accountId ? String(s.accountId) : null }))
        : [],
      timezone: body.timezone ?? 'Europe/Istanbul'
    });

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'content.create',
      entityType: 'Content',
      entityId: content.id,
      request
    });

    return ok({ id: content.id });
  },
  { limit: 60 }
);
