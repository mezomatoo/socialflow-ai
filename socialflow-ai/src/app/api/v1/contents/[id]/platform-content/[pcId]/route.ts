import { apiRoute, ok, badRequest } from '@/lib/api';
import { updatePlatformCaption, restoreOriginalCaption } from '@/lib/services/contentService';
import prisma from '@/lib/prisma';

/** Platforma özel metin/medya düzenleme. */
export const PATCH = apiRoute(
  async (request, { session, params }) => {
    const pc = await prisma.platformContent.findFirst({
      where: { id: params.pcId, content: { id: params.id, workspaceId: session.user.workspaceId } }
    });
    if (!pc) return badRequest('Platform içeriği bulunamadı.');

    const body = await request.json().catch(() => ({}));

    if (typeof body.caption === 'string') {
      try {
        await updatePlatformCaption({
          platformContentId: params.pcId,
          workspaceId: session.user.workspaceId,
          caption: body.caption,
          hashtags: body.hashtags,
          cta: body.cta,
          firstComment: body.firstComment,
          userId: session.user.id
        });
      } catch (err) {
        return badRequest(err instanceof Error ? err.message : 'Metin güncellenemedi.');
      }
    }

    if (body.restoreOriginal === true) {
      await restoreOriginalCaption(params.pcId, session.user.workspaceId);
    }

    // Görsel düzenleme / kırpma / odak noktası
    const visual: any = {};
    if (body.aspectRatio !== undefined) visual.aspectRatio = body.aspectRatio ? String(body.aspectRatio) : null;
    if (body.cropMode !== undefined) visual.cropMode = String(body.cropMode);
    if (body.focalPoint !== undefined) visual.focalPoint = body.focalPoint ? JSON.stringify(body.focalPoint) : null;
    if (body.manualOffset !== undefined) visual.manualOffset = body.manualOffset ? JSON.stringify(body.manualOffset) : null;
    if (body.edits !== undefined) visual.edits = JSON.stringify(body.edits ?? {});
    if (body.renderedKey !== undefined) visual.renderedKey = body.renderedKey ? String(body.renderedKey) : null;
    if (body.renderedUrl !== undefined) visual.renderedUrl = body.renderedUrl ? String(body.renderedUrl) : null;
    if (body.targetWidth !== undefined) visual.targetWidth = body.targetWidth ? Number(body.targetWidth) : null;
    if (body.targetHeight !== undefined) visual.targetHeight = body.targetHeight ? Number(body.targetHeight) : null;
    if (body.mediaAssetId !== undefined) visual.mediaAssetId = body.mediaAssetId ? String(body.mediaAssetId) : null;
    if (body.socialAccountId !== undefined) visual.socialAccountId = body.socialAccountId ? String(body.socialAccountId) : null;
    if (body.enabled !== undefined) visual.enabled = Boolean(body.enabled);
    if (body.safeAreaOk !== undefined) visual.safeAreaOk = Boolean(body.safeAreaOk);

    if (Object.keys(visual).length) {
      await prisma.platformContent.update({ where: { id: params.pcId }, data: { ...visual, updatedAt: new Date() } });
    }

    const updated = await prisma.platformContent.findUnique({ where: { id: params.pcId } });
    return ok(updated);
  },
  { limit: 240 }
);
