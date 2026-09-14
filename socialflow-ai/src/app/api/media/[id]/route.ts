import { apiRoute, ok, badRequest } from '@/lib/api';
import { deleteMedia, updateFocalPoint, parseVariants, parseFocalPoint, parseAnalysis } from '@/lib/services/mediaService';
import prisma from '@/lib/prisma';

export const GET = apiRoute(async (_request, { session, params }) => {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: params.id, workspaceId: session.user.workspaceId },
    include: { brand: { select: { id: true, name: true } } }
  });
  if (!asset) return badRequest('Medya bulunamadı.');
  return ok({
    ...asset,
    focalPoint: parseFocalPoint(asset.focalPoint),
    analysis: parseAnalysis(asset.analysis),
    derivatives: parseVariants(asset.derivatives),
    tags: asset.tags.split(',').filter(Boolean)
  });
});

export const PATCH = apiRoute(
  async (request, { session, params }) => {
    const body = await request.json().catch(() => ({}));
    if (body.focalPoint) {
      await updateFocalPoint(params.id, session.user.workspaceId, body.focalPoint);
    }
    const patch: any = {};
    if (body.tags !== undefined) patch.tags = (Array.isArray(body.tags) ? body.tags : []).join(',');
    if (body.campaign !== undefined) patch.campaign = body.campaign ? String(body.campaign) : null;
    if (body.alt !== undefined) patch.alt = body.alt ? String(body.alt) : null;
    if (body.brandId !== undefined) patch.brandId = body.brandId ? String(body.brandId) : null;
    if (Object.keys(patch).length) {
      await prisma.mediaAsset.updateMany({ where: { id: params.id, workspaceId: session.user.workspaceId }, data: patch });
    }
    return ok({ updated: true });
  },
  { limit: 60 }
);

export const DELETE = apiRoute(
  async (_request, { session, params }) => {
    try {
      await deleteMedia(params.id, session.user.workspaceId);
      return ok({ deleted: true });
    } catch (err) {
      return badRequest(err instanceof Error ? err.message : 'Medya silinemedi.');
    }
  },
  { limit: 30 }
);
