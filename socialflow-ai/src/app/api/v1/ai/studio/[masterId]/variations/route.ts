import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok, badRequest, notFound } from '@/lib/api';
import { assertRole } from '@/lib/auth/session';
import { createMasterVariations } from '@/lib/ai/studioService';

/**
 * PHASE 4 — Kreatif Varyasyonu (§64-§66)
 * POST { styles: ['MINIMAL', 'PREMIUM', ...] }
 * Kontrollü varyasyon: düzen/başlık/CTA çeşitlendirmesi; her varyant yeni
 * bir CreativeVariant kaydıdır (orijinal master dokunulmaz).
 */

const STYLES = ['MINIMAL', 'PREMIUM', 'SALES', 'PRODUCT_FOCUSED', 'CORPORATE', 'MODERN', 'EYE_CATCHING'];

export const POST = apiRoute(
  async (request, { session, params }) => {
    assertModuleEnabled('creativeStudio');
    assertRole(session, 'CREATOR');

    const body = await request.json().catch(() => ({}));
    const styles = Array.isArray(body.styles) ? body.styles.map(String).filter((s: string) => STYLES.includes(s)) : [];
    if (!styles.length) return badRequest(`En az bir geçerli stil seçilmelidir: ${STYLES.join(', ')}`);

    const created = await createMasterVariations({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      masterId: params.masterId,
      styles
    });
    if (!created) return notFound('Kreatif bulunamadı.');
    return ok({ items: created });
  },
  { limit: 30 }
);
