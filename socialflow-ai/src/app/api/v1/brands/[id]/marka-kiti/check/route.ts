import { apiRoute, ok, notFound, badRequest } from '@/lib/api';
import { ensureBrandKit } from '@/lib/brandkit/service';
import { checkBrandConsistency } from '@/lib/ai/brandConsistency';

/**
 * PHASE 4 — Marka Uyumu Kontrolü (§53-§55, §121 Composer entegrasyonu)
 * POST: gönderilecek metni GERÇEK marka kiti koleksiyonlarına göre sunucu
 * tarafında denetler. Workspace izolasyonu ensureBrandKit ile garanti edilir.
 *
 * Gövde: { caption?, cta?, hashtags?, colors?, platform? }
 */

export const POST = apiRoute(
  async (request, { session, params }) => {
    const body = await request.json().catch(() => ({}));
    const caption = typeof body.caption === 'string' ? body.caption : '';
    const cta = typeof body.cta === 'string' ? body.cta : undefined;
    const hashtags = typeof body.hashtags === 'string' ? body.hashtags : undefined;
    const colors = Array.isArray(body.colors) ? body.colors.map(String).slice(0, 12) : undefined;
    const platform = typeof body.platform === 'string' ? body.platform : null;
    if (!caption && !cta && !hashtags) return badRequest('Denetlenecek metin boş olamaz.');

    const kit = await ensureBrandKit({ workspaceId: session.user.workspaceId, brandId: params.id });
    if (!kit) return notFound('Marka bulunamadı.');

    const result = checkBrandConsistency({
      brandKit: kit,
      content: { caption, cta, hashtags, colors },
      platform
    });

    return ok(result);
  },
  { limit: 60 }
);
