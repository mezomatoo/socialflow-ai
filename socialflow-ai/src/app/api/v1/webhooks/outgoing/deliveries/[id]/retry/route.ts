import { apiRoute, ok, badRequest } from '@/lib/api';
import { isFeatureEnabled } from '@/lib/brandkit/featureFlags';
import { retryDeadLetterDelivery } from '@/lib/webhooks/outbound';
import { audit } from '@/lib/security/audit';

export const POST = apiRoute(async (request, { session, params }) => {
  if (!isFeatureEnabled('outgoingWebhooks')) {
    return badRequest('Çıkış webhookları bu kurulumda kapalı.', 404);
  }

  if (session.user.role === 'VIEWER') {
    return badRequest('Görüntüleyici rolü webhook yeniden deneyemez.', 403);
  }

  const id = params?.id;
  try {
    const result = await retryDeadLetterDelivery(session.user.workspaceId, id);

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'webhook.delivery_retried',
      entityType: 'WebhookDelivery',
      entityId: id,
      request
    });

    return ok(result);
  } catch (err: any) {
    return badRequest(err?.message || 'Yeniden deneme başarısız oldu.');
  }
});
