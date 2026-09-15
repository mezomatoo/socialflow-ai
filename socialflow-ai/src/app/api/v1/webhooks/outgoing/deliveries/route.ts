import { apiRoute, ok, badRequest } from '@/lib/api';
import { isFeatureEnabled } from '@/lib/brandkit/featureFlags';
import { listDeliveries } from '@/lib/webhooks/outbound';

export const GET = apiRoute(async (request, { session }) => {
  if (!isFeatureEnabled('outgoingWebhooks')) {
    return badRequest('Çıkış webhookları bu kurulumda kapalı.', 404);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || undefined;
  const subscriptionId = url.searchParams.get('subscriptionId') || undefined;
  const take = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));

  const deliveries = await listDeliveries(session.user.workspaceId, {
    status,
    subscriptionId,
    take
  });

  return ok({ deliveries });
});
