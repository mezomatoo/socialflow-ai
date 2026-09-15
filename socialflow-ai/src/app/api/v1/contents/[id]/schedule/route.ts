import { apiRoute, ok, badRequest } from '@/lib/api';
import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { scheduleContent, cancelSchedule } from '@/lib/services/schedulingService';
import { audit } from '@/lib/security/audit';

/** "Planla" */
export const POST = apiRoute(
  async (request, { session, params }) => {
    assertModuleEnabled('scheduling');
    const body = await request.json().catch(() => ({}));

    if (body.cancel === true) {
      const res = await cancelSchedule({ contentId: params.id, workspaceId: session.user.workspaceId });
      return ok(res);
    }

    if (!body.scheduledFor) return badRequest('Yayın tarihi ve saati seçilmedi.');
    const when = new Date(String(body.scheduledFor));
    if (Number.isNaN(when.getTime())) return badRequest('Tarih biçimi geçersiz.');
    if (when.getTime() < Date.now() - 60_000) return badRequest('Seçilen zaman geçmişte. Lütfen ileri bir tarih seçin.');

    const res = await scheduleContent({
      contentId: params.id,
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      scheduledFor: when,
      timezone: body.timezone ?? 'Europe/Istanbul',
      targetIds: Array.isArray(body.targetIds) ? body.targetIds.map(String) : undefined,
      aiSuggested: Boolean(body.aiSuggested)
    });

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'content.schedule',
      entityType: 'Content',
      entityId: params.id,
      metadata: { scheduledFor: when.toISOString(), targets: res.scheduled },
      request
    });

    return ok({ ...res, demoMode: session.user.demoMode });
  },
  { limit: 40 }
);
