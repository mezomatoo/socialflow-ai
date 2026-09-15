import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok, badRequest, fail } from '@/lib/api';
import { hasRole } from '@/lib/auth/session';
import { generateContentPlan, type PlanRequest } from '@/lib/planner/service';

/**
 * PHASE 4 — AI Planlayıcı: plan üretimi (§80-§85, §123)
 * POST { brandId, platforms[], dateFrom, dateTo, campaignId?, goal?, frequency?, ... }
 * Plan ContentPlan/ContentPlanItem olarak kaydedilir; ASLA yayınlanmaz.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const POST = apiRoute(
  async (request, { session }) => {
    if (!isModuleEnabled('aiAssistant')) {
      return fail('MODULE_NOT_ENABLED', 'AI planlayıcı bu kurulumda kapalı.', 501);
    }
    if (!hasRole(session.user.role, 'CREATOR')) {
      return fail('FORBIDDEN', 'Bu işlem için yetkiniz bulunmuyor.', 403);
    }

    const body = await request.json().catch(() => ({}));
    const brandId = String(body.brandId ?? '');
    const platforms = Array.isArray(body.platforms) ? body.platforms.map((p: unknown) => String(p).toUpperCase()).slice(0, 8) : [];
    const dateFrom = String(body.dateFrom ?? '');
    const dateTo = String(body.dateTo ?? '');
    if (!brandId) return badRequest('Marka seçilmelidir.');
    if (!platforms.length) return badRequest('En az bir platform seçilmelidir.');
    if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) return badRequest('Tarih biçimi YYYY-MM-DD olmalıdır.');
    if (new Date(dateTo) < new Date(dateFrom)) return badRequest('Bitiş tarihi başlangıçtan önce olamaz.');

    try {
      const plan = await generateContentPlan(
        {
          brandId,
          platforms,
          dateFrom,
          dateTo,
          campaignId: typeof body.campaignId === 'string' && body.campaignId ? body.campaignId : null,
          goal: typeof body.goal === 'string' ? body.goal.slice(0, 120) : null,
          frequency: typeof body.frequency === 'string' ? body.frequency.slice(0, 40) : null,
          targetAudience: typeof body.targetAudience === 'string' ? body.targetAudience.slice(0, 300) : null,
          tone: typeof body.tone === 'string' ? body.tone.slice(0, 120) : null,
          importantDates: typeof body.importantDates === 'string' ? body.importantDates.slice(0, 300) : null
        } satisfies PlanRequest,
        { workspaceId: session.user.workspaceId, userId: session.user.id }
      );
      return ok(plan);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'Plan oluşturulamadı.');
    }
  },
  { limit: 15 }
);
