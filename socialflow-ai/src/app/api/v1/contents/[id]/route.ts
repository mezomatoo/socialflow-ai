import { apiRoute, ok, notFound, badRequest } from '@/lib/api';
import prisma from '@/lib/prisma';
import { getContentDetail, updateMasterCaption, syncSelections, deleteContent } from '@/lib/services/contentService';
import { audit } from '@/lib/security/audit';

export const GET = apiRoute(async (_request, { session, params }) => {
  const detail = await getContentDetail(params.id, session.user.workspaceId);
  if (!detail) return notFound('İçerik bulunamadı.');
  return ok(detail);
});

/** Otomatik kaydetme + master açıklama / seçim güncelleme. */
export const PATCH = apiRoute(
  async (request, { session, params }) => {
    const existing = await prisma.content.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!existing) return notFound('İçerik bulunamadı.');

    const body = await request.json().catch(() => ({}));

    if (Array.isArray(body.selections)) {
      await syncSelections(
        params.id,
        session.user.workspaceId,
        body.selections.map((s: any) => ({ platform: String(s.platform), contentType: String(s.contentType), accountId: s.accountId ? String(s.accountId) : null }))
      );
    }

    if (typeof body.masterCaption === 'string' && body.masterCaption !== existing.masterCaption) {
      await updateMasterCaption({
        contentId: params.id,
        workspaceId: session.user.workspaceId,
        masterCaption: body.masterCaption,
        storyText: body.storyText !== undefined ? body.storyText : undefined,
        title: body.title !== undefined ? body.title : undefined,
        linkUrl: body.linkUrl !== undefined ? body.linkUrl : undefined,
        defaultStyle: body.defaultStyle,
        userId: session.user.id
      });
    } else {
      await prisma.content.update({
        where: { id: params.id },
        data: {
          ...(body.storyText !== undefined ? { storyText: body.storyText ? String(body.storyText) : null } : {}),
          ...(body.title !== undefined ? { title: body.title ? String(body.title) : null } : {}),
          ...(body.linkUrl !== undefined ? { linkUrl: body.linkUrl ? String(body.linkUrl) : null } : {}),
          ...(body.defaultStyle ? { defaultStyle: String(body.defaultStyle) } : {}),
          ...(body.defaultCta !== undefined ? { defaultCta: body.defaultCta ? String(body.defaultCta) : null } : {}),
          ...(body.hashtagPlacement ? { hashtagPlacement: String(body.hashtagPlacement) } : {}),
          ...(body.campaignId !== undefined ? { campaignId: body.campaignId ? String(body.campaignId) : null } : {})
        }
      });
    }

    // Platform bazlı hesap eşlemeleri
    if (Array.isArray(body.accountAssignments)) {
      for (const a of body.accountAssignments) {
        await prisma.platformContent.updateMany({
          where: { id: String(a.platformContentId), contentId: params.id },
          data: { socialAccountId: a.accountId ? String(a.accountId) : null }
        });
      }
    }

    const detail = await getContentDetail(params.id, session.user.workspaceId);
    return ok(detail);
  },
  { limit: 240 }
);

export const DELETE = apiRoute(
  async (_request, { session, params }) => {
    await deleteContent(params.id, session.user.workspaceId);
    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'content.delete',
      entityType: 'Content',
      entityId: params.id
    });
    return ok({ deleted: true });
  },
  { limit: 30 }
);
