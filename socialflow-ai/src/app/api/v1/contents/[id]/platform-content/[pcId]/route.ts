import { apiRoute, ok, badRequest } from '@/lib/api';
import { updatePlatformCaption, restoreOriginalCaption, ownedAccountId } from '@/lib/services/contentService';
import { AppError } from '@/lib/errors';
import prisma from '@/lib/prisma';

/** Platforma özel metin/medya düzenleme. */
function badRequestApp(message: string) {
  return new AppError('VALIDATION_ERROR', message, { status: 400, recoverable: true });
}

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
        // Kural ihlali 422 + PLATFORM_RULE_VIOLATION olarak iletilir (normalize hata).
        if (err instanceof AppError) throw err;
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
    if (body.mediaAssetId !== undefined) {
      const mediaId = body.mediaAssetId ? String(body.mediaAssetId) : null;
      if (mediaId) {
        const owned = await prisma.mediaAsset.findFirst({
          where: { id: mediaId, workspaceId: session.user.workspaceId },
          select: { id: true }
        });
        if (!owned) throw badRequestApp('Bu medya bu çalışma alanına ait değil.');
      }
      visual.mediaAssetId = mediaId;
    }
    if (body.socialAccountId !== undefined) {
      const raw = body.socialAccountId ? String(body.socialAccountId) : null;
      const accId = raw ? await ownedAccountId(session.user.workspaceId, raw) : null;
      if (raw && !accId) throw badRequestApp('Bu hesap bu çalışma alanına ait değil.');
      visual.socialAccountId = accId;
    }
    if (body.enabled !== undefined) visual.enabled = Boolean(body.enabled);
    if (body.safeAreaOk !== undefined) visual.safeAreaOk = Boolean(body.safeAreaOk);

    if (Object.keys(visual).length) {
      await prisma.platformContent.update({ where: { id: params.pcId }, data: { ...visual, updatedAt: new Date() } });
    }

    const updated = await prisma.platformContent.findFirst({
      where: { id: params.pcId, content: { id: params.id, workspaceId: session.user.workspaceId } }
    });
    return ok(updated);
  },
  { limit: 240 }
);
