import { apiRoute, ok, badRequest } from '@/lib/api';
import { isFeatureEnabled } from '@/lib/brandkit/featureFlags';
import { listSubscriptions, createSubscription } from '@/lib/webhooks/outbound';
import { audit } from '@/lib/security/audit';

export const GET = apiRoute(async (_request, { session }) => {
  if (!isFeatureEnabled('outgoingWebhooks')) {
    return badRequest('Çıkış webhookları bu kurulumda kapalı.', 404);
  }

  const subscriptions = await listSubscriptions(session.user.workspaceId);
  return ok({
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      url: s.url,
      events: JSON.parse(s.events || '[]'),
      isActive: s.isActive,
      description: s.description,
      consecutiveFailures: s.consecutiveFailures,
      disabledAt: s.disabledAt,
      disabledReason: s.disabledReason,
      createdAt: s.createdAt,
      deliveriesCount: s._count.deliveries
    }))
  });
});

export const POST = apiRoute(async (request, { session }) => {
  if (!isFeatureEnabled('outgoingWebhooks')) {
    return badRequest('Çıkış webhookları bu kurulumda kapalı.', 404);
  }

  if (session.user.role === 'VIEWER') {
    return badRequest('Görüntüleyici rolü webhook oluşturamaz.', 403);
  }

  const body = await request.json().catch(() => ({}));
  if (!body.url || typeof body.url !== 'string') {
    return badRequest('Webhook URL adresi zorunludur.');
  }

  try {
    const sub = await createSubscription(session.user.workspaceId, {
      url: body.url,
      events: Array.isArray(body.events) ? body.events : ['*'],
      description: body.description,
      secret: body.secret
    });

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'webhook.subscription_created',
      entityType: 'WebhookSubscription',
      entityId: sub.id,
      request
    });

    return ok({
      id: sub.id,
      url: sub.url,
      secret: sub.secret,
      events: JSON.parse(sub.events || '[]'),
      isActive: sub.isActive,
      description: sub.description,
      createdAt: sub.createdAt
    });
  } catch (err: any) {
    return badRequest(err?.message || 'Abonelik oluşturulamadı.');
  }
});
