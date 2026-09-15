import { apiRoute, ok, badRequest } from '@/lib/api';
import { isFeatureEnabled } from '@/lib/brandkit/featureFlags';
import { updateSubscription, deleteSubscription } from '@/lib/webhooks/outbound';
import prisma from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

export const GET = apiRoute(async (_request, { session, params }) => {
  if (!isFeatureEnabled('outgoingWebhooks')) {
    return badRequest('Çıkış webhookları bu kurulumda kapalı.', 404);
  }

  const id = params?.id;
  const sub = await prisma.webhookSubscription.findFirst({
    where: { id, workspaceId: session.user.workspaceId },
    include: {
      deliveries: {
        orderBy: { createdAt: 'desc' },
        take: 20
      }
    }
  });

  if (!sub) return badRequest('Webhook aboneliği bulunamadı.', 404);

  return ok({
    subscription: {
      id: sub.id,
      url: sub.url,
      secret: sub.secret,
      events: JSON.parse(sub.events || '[]'),
      isActive: sub.isActive,
      description: sub.description,
      consecutiveFailures: sub.consecutiveFailures,
      disabledAt: sub.disabledAt,
      disabledReason: sub.disabledReason,
      createdAt: sub.createdAt,
      recentDeliveries: sub.deliveries
    }
  });
});

export const PATCH = apiRoute(async (request, { session, params }) => {
  if (!isFeatureEnabled('outgoingWebhooks')) {
    return badRequest('Çıkış webhookları bu kurulumda kapalı.', 404);
  }

  if (session.user.role === 'VIEWER') {
    return badRequest('Görüntüleyici rolü webhook güncelleyemez.', 403);
  }

  const id = params?.id;
  const body = await request.json().catch(() => ({}));

  try {
    const updated = await updateSubscription(session.user.workspaceId, id, {
      url: body.url,
      events: body.events,
      description: body.description,
      isActive: body.isActive,
      secret: body.secret
    });

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'webhook.subscription_updated',
      entityType: 'WebhookSubscription',
      entityId: id,
      request
    });

    return ok({
      id: updated.id,
      url: updated.url,
      events: JSON.parse(updated.events || '[]'),
      isActive: updated.isActive,
      description: updated.description,
      consecutiveFailures: updated.consecutiveFailures,
      updatedAt: updated.updatedAt
    });
  } catch (err: any) {
    return badRequest(err?.message || 'Abonelik güncellenemedi.');
  }
});

export const DELETE = apiRoute(async (request, { session, params }) => {
  if (!isFeatureEnabled('outgoingWebhooks')) {
    return badRequest('Çıkış webhookları bu kurulumda kapalı.', 404);
  }

  if (session.user.role === 'VIEWER') {
    return badRequest('Görüntüleyici rolü webhook silemez.', 403);
  }

  const id = params?.id;
  try {
    await deleteSubscription(session.user.workspaceId, id);

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'webhook.subscription_deleted',
      entityType: 'WebhookSubscription',
      entityId: id,
      request
    });

    return ok({ message: 'Webhook aboneliği silindi.' });
  } catch (err: any) {
    return badRequest(err?.message || 'Abonelik silinemedi.');
  }
});
