import { apiRoute, ok, badRequest } from '@/lib/api';
import { isFeatureEnabled } from '@/lib/brandkit/featureFlags';
import { sendTestPing } from '@/lib/webhooks/outbound';

export const POST = apiRoute(async (_request, { session, params }) => {
  if (!isFeatureEnabled('outgoingWebhooks')) {
    return badRequest('Çıkış webhookları bu kurulumda kapalı.', 404);
  }

  const id = params?.id;
  try {
    const result = await sendTestPing(session.user.workspaceId, id);
    return ok(result);
  } catch (err: any) {
    return badRequest(err?.message || 'Test gönderimi yapılamadı.');
  }
});
