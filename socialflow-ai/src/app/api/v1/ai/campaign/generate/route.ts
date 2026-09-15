import { apiRoute, ok, badRequest, fail } from '@/lib/api';
import { hasRole } from '@/lib/auth/session';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { generateCampaignConcept, type CampaignRequest } from '@/lib/campaign/aiCampaign';

/**
 * PHASE 4 — AI Kampanya konsepti (§86)
 * POST { brandId, goal, startDate, endDate, platforms[], name?, userFacts? }
 * Ürün/teklif/kupon modülü KULLANILMAZ ve OLUŞTURULMAZ (§10/§12/§87).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const POST = apiRoute(
  async (request, { session }) => {
    if (!isModuleEnabled('aiAssistant')) {
      return fail('MODULE_NOT_ENABLED', 'AI kampanya oluşturucu bu kurulumda kapalı.', 501);
    }
    if (!hasRole(session.user.role, 'CREATOR')) {
      return fail('FORBIDDEN', 'Bu işlem için yetkiniz bulunmuyor.', 403);
    }
    const body = await request.json().catch(() => ({}));
    const brandId = String(body.brandId ?? '');
    const goal = String(body.goal ?? '').trim();
    const platforms = Array.isArray(body.platforms) ? body.platforms.map((p: unknown) => String(p).toUpperCase()).slice(0, 8) : [];
    const startDate = String(body.startDate ?? '');
    const endDate = String(body.endDate ?? '');
    if (!brandId) return badRequest('Marka seçilmelidir.');
    if (goal.length < 2) return badRequest('Kampanya hedefi gereklidir.');
    if (!platforms.length) return badRequest('En az bir platform seçilmelidir.');
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return badRequest('Tarih biçimi YYYY-MM-DD olmalıdır.');
    if (new Date(endDate) < new Date(startDate)) return badRequest('Bitiş tarihi başlangıçtan önce olamaz.');

    try {
      const concept = await generateCampaignConcept(
        {
          brandId,
          goal: goal.slice(0, 120),
          name: typeof body.name === 'string' ? body.name.slice(0, 120) : null,
          startDate,
          endDate,
          platforms,
          userFacts: typeof body.userFacts === 'string' ? body.userFacts.slice(0, 600) : null
        } satisfies CampaignRequest,
        { workspaceId: session.user.workspaceId, userId: session.user.id }
      );
      return ok(concept);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'Kampanya konsepti oluşturulamadı.');
    }
  },
  { limit: 15 }
);
