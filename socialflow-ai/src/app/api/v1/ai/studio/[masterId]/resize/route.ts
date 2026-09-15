import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok, badRequest, notFound } from '@/lib/api';
import { assertRole } from '@/lib/auth/session';
import { resizeMasterCreative, type StudioAspectRatio } from '@/lib/ai/studioService';

/**
 * PHASE 4 — Platformlara Uyarla (Akıllı Yeniden Boyutlandırma §63/§62)
 * POST { targets: [{ platform, contentType?, aspectRatio }] }
 * Master kreatif hedef oranlara YENİDEN bileştirilir (esnetme yok);
 * sonuç CreativeVariant kaydıdır, master ve orijinal varlık değişmez.
 */

const RATIOS = ['1:1', '4:5', '9:16', '16:9'];

export const POST = apiRoute(
  async (request, { session, params }) => {
    assertModuleEnabled('creativeStudio');
    assertRole(session, 'CREATOR');

    const body = await request.json().catch(() => ({}));
    const targets = Array.isArray(body.targets) ? body.targets.slice(0, 8) : [];
    if (!targets.length) return badRequest('En az bir hedef platform/oran seçilmelidir.');
    for (const t of targets) {
      if (!t?.platform || !RATIOS.includes(t?.aspectRatio)) {
        return badRequest('Geçersiz hedef: platform ve oran (1:1, 4:5, 9:16, 16:9) gereklidir.');
      }
    }

    const created = await resizeMasterCreative({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      masterId: params.masterId,
      targets: targets.map((t: any) => ({
        platform: String(t.platform),
        contentType: t.contentType ? String(t.contentType) : undefined,
        aspectRatio: t.aspectRatio as StudioAspectRatio
      }))
    });
    if (!created) return notFound('Kreatif bulunamadı.');
    return ok({ items: created });
  },
  { limit: 30 }
);
