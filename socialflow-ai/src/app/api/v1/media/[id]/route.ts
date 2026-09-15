import { apiRoute, ok } from '@/lib/api';
import { deleteMedia, updateFocalPoint, parseVariants, parseFocalPoint, parseAnalysis } from '@/lib/services/mediaService';
import { mediaUsage, listMediaVariants } from '@/lib/services/mediaProcessingService';
import { notFound } from '@/lib/errors';
import prisma from '@/lib/prisma';

export const GET = apiRoute(async (_request, { session, params }) => {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: params.id, workspaceId: session.user.workspaceId },
    include: { brand: { select: { id: true, name: true } } }
  });
  if (!asset) throw notFound('Medya bulunamadı.');
  const [variants, usage] = await Promise.all([
    listMediaVariants(session.user.workspaceId, asset.id),
    mediaUsage(session.user.workspaceId, asset.id)
  ]);
  return ok({
    ...asset,
    focalPoint: parseFocalPoint(asset.focalPoint),
    analysis: parseAnalysis(asset.analysis),
    derivatives: parseVariants(asset.derivatives),
    // Türevler artık birinci sınıf kayıt (§43) — orijinal değişmez (§42).
    variants,
    usage,
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
  async (request, { session, params }) => {
    // Aktif referans varsa 409 döner (AppError → apiRoute eşlemesi).
    const force = new URL(request.url).searchParams.get('force') === '1';
    const result = await deleteMedia(params.id, session.user.workspaceId, { force });
    return ok(result);
  },
  { limit: 30 }
);
