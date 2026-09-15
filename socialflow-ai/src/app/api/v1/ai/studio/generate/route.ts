import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok, badRequest } from '@/lib/api';
import { assertRole } from '@/lib/auth/session';
import { generateStudioImages, type StudioAspectRatio } from '@/lib/ai/studioService';

/**
 * PHASE 4 — AI Stüdyo: Görsel Üretimi (§50, §59-§60, §122)
 * POST { brandId, prompt, aspectRatio?, count?, headline?, cta?, negativePrompt? }
 * → her sonuç: MediaAsset + MasterCreative + kalite + tutarlılık (tam zincir).
 */

const RATIOS = ['1:1', '4:5', '9:16', '16:9'];

export const POST = apiRoute(
  async (request, { session }) => {
    assertModuleEnabled('creativeStudio');
    assertRole(session, 'CREATOR');

    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt ?? '').trim();
    if (prompt.length < 3) return badRequest('Kreatif fikri en az 3 karakter olmalıdır.');
    if (prompt.length > 500) return badRequest('Kreatif fikri en fazla 500 karakter olabilir.');
    const brandId = String(body.brandId ?? '');
    if (!brandId) return badRequest('Marka seçilmelidir.');

    const aspectRatio = RATIOS.includes(body.aspectRatio) ? (body.aspectRatio as StudioAspectRatio) : '1:1';
    const count = Math.min(Math.max(Number(body.count) || 4, 1), 6);

    const results = await generateStudioImages({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      brandId,
      prompt,
      negativePrompt: typeof body.negativePrompt === 'string' ? body.negativePrompt.slice(0, 300) : null,
      aspectRatio,
      count,
      visualStyle: typeof body.visualStyle === 'string' ? body.visualStyle : null,
      headline: typeof body.headline === 'string' ? body.headline.slice(0, 120) : null,
      cta: typeof body.cta === 'string' ? body.cta.slice(0, 60) : null,
      campaignId: typeof body.campaignId === 'string' && body.campaignId ? body.campaignId : null
    });

    return ok({ items: results, provider: results[0]?.provider ?? 'deterministic' });
  },
  { limit: 20 }
);
