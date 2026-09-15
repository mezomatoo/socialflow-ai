import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok } from '@/lib/api';
import { listMasters } from '@/lib/ai/studioService';

/** PHASE 4 — AI Stüdyo geçmişi: master kreatifler + varyant + kalite. */
export const GET = apiRoute(async (request, { session }) => {
  assertModuleEnabled('creativeStudio');
  const brandId = new URL(request.url).searchParams.get('brandId');
  const masters = await listMasters(session.user.workspaceId, brandId);
  return ok({
    items: masters.map((m) => ({
      id: m.id,
      title: m.title,
      aspectRatio: m.aspectRatio,
      width: m.width,
      height: m.height,
      fileUrl: m.fileUrl,
      brandKitVersion: m.brandKitVersion,
      createdAt: m.createdAt,
      quality: m.quality ? { overall: m.quality.overall, details: m.quality.details } : null,
      variants: m.variants.map((v) => ({
        id: v.id,
        platform: v.platform,
        contentType: v.contentType,
        aspectRatio: v.aspectRatio,
        fileUrl: v.fileUrl,
        status: v.status
      }))
    }))
  });
});
