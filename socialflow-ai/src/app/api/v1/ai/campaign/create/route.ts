import { apiRoute, ok, badRequest, fail } from '@/lib/api';
import { hasRole } from '@/lib/auth/session';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { generateCampaignConcept, createCampaignFromConcept, type CampaignRequest } from '@/lib/campaign/aiCampaign';

/**
 * PHASE 4 — AI Kampanya: konsepti GERÇEK Campaign kaydına dönüştürür (§86).
 * Body, generate ile aynı alanlara ek olarak name zorunludur (kampanya adı).
 */
export const POST = apiRoute(
  async (request, { session }) => {
    if (!isModuleEnabled('aiAssistant')) {
      return fail('MODULE_NOT_ENABLED', 'AI kampanya oluşturucu bu kurulumda kapalı.', 501);
    }
    if (!hasRole(session.user.role, 'EDITOR')) {
      return fail('FORBIDDEN', 'Kampanya oluşturmak için yetkiniz bulunmuyor.', 403);
    }
    const body = await request.json().catch(() => ({}));
    const brandId = String(body.brandId ?? '');
    const goal = String(body.goal ?? '').trim();
    const platforms = Array.isArray(body.platforms) ? body.platforms.map((p: unknown) => String(p).toUpperCase()).slice(0, 8) : [];
    const startDate = String(body.startDate ?? '');
    const endDate = String(body.endDate ?? '');
    const name = String(body.name ?? '').trim();
    if (!brandId || goal.length < 2 || !platforms.length || !name) {
      return badRequest('Marka, hedef, platformlar ve kampanya adı gereklidir.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return badRequest('Tarih biçimi YYYY-MM-DD olmalıdır.');
    }
    if (new Date(endDate) < new Date(startDate)) return badRequest('Bitiş tarihi başlangıçtan önce olamaz.');

    const input = {
      brandId,
      goal: goal.slice(0, 120),
      name: name.slice(0, 120),
      startDate,
      endDate,
      platforms,
      userFacts: typeof body.userFacts === 'string' ? body.userFacts.slice(0, 600) : null
    } satisfies CampaignRequest;

    const concept = await generateCampaignConcept(input, { workspaceId: session.user.workspaceId, userId: session.user.id });
    const campaign = await createCampaignFromConcept(input, concept, {
      workspaceId: session.user.workspaceId,
      userId: session.user.id
    });
    return ok({
      campaignId: campaign.id,
      code: campaign.code,
      name: campaign.name,
      concept
    });
  },
  { limit: 10 }
);
