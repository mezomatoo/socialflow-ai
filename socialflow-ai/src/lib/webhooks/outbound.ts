/**
 * Çıkış Webhook'ları Altyapısı (§93)
 * ---------------------------------------------------------------------------
 * - İmzalı payload (HMAC-SHA256, x-socialflow-signature-256).
 * - Çoklu kiracılık (workspaceId) izolasyonu.
 * - Otomatik yeniden deneme (exponential backoff) ve Dead-Letter Queue (DLQ).
 * - 10 ardışık başarısızlıkta devre kesici (circuit breaker - otomatik devre dışı bırakma).
 * - Dead-letter el ile yeniden deneme (replay) mekanizması.
 * - FF_OUTGOING_WEBHOOKS özellik bayrağı entegrasyonu.
 */

import { createHmac, randomBytes } from 'crypto';
import prisma from '../prisma';
import { enqueue } from '../queue/queue';
import { isFeatureEnabled } from '../brandkit/featureFlags';

export interface WebhookPayload<T = Record<string, unknown>> {
  id: string;
  event: string;
  timestamp: string;
  workspaceId: string;
  data: T;
}

export interface DeliveryResult {
  [key: string]: unknown;
  success: boolean;
  deliveryId: string;
  status: 'DELIVERED' | 'RETRYING' | 'DEAD_LETTER';
  httpStatus?: number;
  error?: string;
  nextRetryAt?: Date | null;
}

/** Yeni bir webhook aboneliği için güvenli imza anahtarı üretir. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

/** Payload'ı HMAC-SHA256 ile imzalar. */
export function signWebhookPayload(payloadStr: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payloadStr, 'utf8').digest('hex');
}

/**
 * Belirli bir olay gerçekleştiğinde kayıtlı tüm aktif aboneliklere çıkış webhook'u tetikler.
 */
export async function dispatchOutboundWebhook(
  workspaceId: string,
  event: string,
  data: Record<string, unknown>
): Promise<string[]> {
  if (!isFeatureEnabled('outgoingWebhooks')) {
    return [];
  }

  // Çalışma alanına ait aktif abonelikleri al
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: { workspaceId, isActive: true }
  });

  const matching = subscriptions.filter((sub) => {
    try {
      const events: string[] = JSON.parse(sub.events || '[]');
      return events.includes('*') || events.includes(event);
    } catch {
      return false;
    }
  });

  if (matching.length === 0) return [];

  const deliveryIds: string[] = [];

  for (const sub of matching) {
    const payloadObj: WebhookPayload = {
      id: `del_${randomBytes(12).toString('hex')}`,
      event,
      timestamp: new Date().toISOString(),
      workspaceId,
      data
    };
    const serialized = JSON.stringify(payloadObj);

    const delivery = await prisma.webhookDelivery.create({
      data: {
        id: payloadObj.id,
        workspaceId,
        subscriptionId: sub.id,
        event,
        payload: serialized,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5
      }
    });

    deliveryIds.push(delivery.id);

    // Arka plan iş kuyruğuna ekle
    await enqueue({
      type: 'OutboundWebhookJob',
      idempotencyKey: `webhook:delivery:${delivery.id}:attempt:0`,
      workspaceId,
      payload: { deliveryId: delivery.id }
    });
  }

  return deliveryIds;
}

/**
 * Kuyruk işçisinin çağırdığı teslimat yürütücüsü.
 * HTTP çağrısını yapar, imzalar, başarılı ise 'DELIVERED', başarısız ise exponential retry veya 'DEAD_LETTER' yapar.
 */
export async function executeWebhookDelivery(
  deliveryId: string,
  opts: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {}
): Promise<DeliveryResult> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { subscription: true }
  });

  if (!delivery) throw new Error(`Webhook teslimatı bulunamadı: ${deliveryId}`);

  const sub = delivery.subscription;
  if (!sub || !sub.isActive) {
    // Abonelik silinmiş veya pasif ise dead letter yap
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'DEAD_LETTER',
        lastError: 'Abonelik pasif veya bulunamadı.'
      }
    });
    return {
      success: false,
      deliveryId,
      status: 'DEAD_LETTER',
      error: 'Abonelik pasif veya silinmiş.'
    };
  }

  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(delivery.payload, sub.secret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let responseStatus: number | undefined;
  let responseBody: string | undefined;
  let isSuccess = false;
  let errorMessage: string | null = null;

  try {
    const res = await fetchFn(sub.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'SocialFlow-Webhooks/1.0',
        'x-socialflow-signature-256': signature,
        'x-socialflow-timestamp': String(timestamp),
        'x-socialflow-delivery-id': delivery.id,
        'x-socialflow-event': delivery.event
      },
      body: delivery.payload,
      signal: controller.signal
    });

    responseStatus = res.status;
    const text = await res.text().catch(() => '');
    responseBody = text.slice(0, 1000); // En fazla 1000 karakter kaydet

    if (res.ok) {
      isSuccess = true;
    } else {
      errorMessage = `HTTP ${res.status}: ${responseBody || res.statusText}`;
    }
  } catch (err: any) {
    errorMessage = err?.name === 'AbortError' ? `İstek zaman aşımına uğradı (${timeoutMs} ms)` : err?.message || 'Ağ hatası';
  } finally {
    clearTimeout(timer);
  }

  const nextAttempt = delivery.attempts + 1;

  if (isSuccess) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'DELIVERED',
          attempts: nextAttempt,
          responseStatus,
          responseBody,
          deliveredAt: new Date(),
          lastError: null
        }
      }),
      // Başarılı gönderimde ardışık hata sayacını sıfırla
      prisma.webhookSubscription.update({
        where: { id: sub.id },
        data: { consecutiveFailures: 0 }
      })
    ]);

    return {
      success: true,
      deliveryId,
      status: 'DELIVERED',
      httpStatus: responseStatus
    };
  }

  // Başarısızlık durumu: Yeniden deneme mi, Dead-Letter mı?
  const reachedMax = nextAttempt >= delivery.maxAttempts;
  const newStatus = reachedMax ? 'DEAD_LETTER' : 'RETRYING';

  // Exponential backoff gecikmesi: 10s * 2^(attempt-1), max 1 saat
  const backoffMs = Math.min(3600_000, 10_000 * Math.pow(2, nextAttempt - 1));
  const nextRetryAt = reachedMax ? null : new Date(Date.now() + backoffMs);

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: newStatus,
      attempts: nextAttempt,
      responseStatus,
      responseBody,
      lastError: errorMessage,
      nextRetryAt
    }
  });

  if (reachedMax) {
    // Dead letter durumunda aboneliğin ardışık hata sayısını artır
    const updatedSub = await prisma.webhookSubscription.update({
      where: { id: sub.id },
      data: { consecutiveFailures: { increment: 1 } }
    });

    // Devre kesici (Circuit breaker): 10 ardışık dead-letter olduğunda aboneliği durdur
    if (updatedSub.consecutiveFailures >= 10) {
      await prisma.webhookSubscription.update({
        where: { id: sub.id },
        data: {
          isActive: false,
          disabledAt: new Date(),
          disabledReason: '10 ardışık teslimat başarısızlığı (Dead-Letter eşiği aşıldı)'
        }
      });
    }
  } else {
    // Tekrar deneme için sıradaki işi kuyruğa ekle
    await enqueue({
      type: 'OutboundWebhookJob',
      idempotencyKey: `webhook:delivery:${delivery.id}:attempt:${nextAttempt}`,
      workspaceId: delivery.workspaceId,
      runAt: nextRetryAt!,
      payload: { deliveryId: delivery.id }
    });
  }

  return {
    success: false,
    deliveryId,
    status: newStatus,
    httpStatus: responseStatus,
    error: errorMessage || undefined,
    nextRetryAt
  };
}

/**
 * Dead-letter durumundaki bir teslimatı yeniden kuyruğa alır (replay).
 */
export async function retryDeadLetterDelivery(
  workspaceId: string,
  deliveryId: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<DeliveryResult> {
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, workspaceId }
  });

  if (!delivery) throw new Error('Teslimat kaydı bulunamadı.');

  // Teslimat durumunu PENDING'e çekip deneme sayısını sıfırla
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: 'PENDING',
      attempts: 0,
      nextRetryAt: null,
      lastError: null
    }
  });

  return executeWebhookDelivery(deliveryId, opts);
}

/**
 * Abonelik yönetimi işlevleri
 */

export async function listSubscriptions(workspaceId: string) {
  return prisma.webhookSubscription.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          deliveries: true
        }
      }
    }
  });
}

export async function createSubscription(
  workspaceId: string,
  data: {
    url: string;
    events: string[];
    description?: string;
    secret?: string;
  }
) {
  if (!isFeatureEnabled('outgoingWebhooks')) {
    throw new Error('FEATURE_DISABLED: Çıkış webhookları bu kurulumda kapalı.');
  }

  try {
    const parsed = new URL(data.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Geçersiz URL protokolü');
    }
  } catch {
    throw new Error('Geçerli bir webhook hedef URL adresi girilmelidir.');
  }

  const secret = data.secret?.trim() || generateWebhookSecret();
  const events = Array.isArray(data.events) && data.events.length > 0 ? data.events : ['*'];

  return prisma.webhookSubscription.create({
    data: {
      workspaceId,
      url: data.url.trim(),
      secret,
      events: JSON.stringify(events),
      description: data.description?.trim() || null,
      isActive: true
    }
  });
}

export async function updateSubscription(
  workspaceId: string,
  id: string,
  data: {
    url?: string;
    events?: string[];
    description?: string;
    isActive?: boolean;
    secret?: string;
  }
) {
  const sub = await prisma.webhookSubscription.findFirst({
    where: { id, workspaceId }
  });
  if (!sub) throw new Error('Webhook aboneliği bulunamadı.');

  const updateData: any = {};
  if (data.url !== undefined) {
    new URL(data.url); // geçerli URL denetimi
    updateData.url = data.url.trim();
  }
  if (data.events !== undefined) {
    updateData.events = JSON.stringify(data.events);
  }
  if (data.description !== undefined) {
    updateData.description = data.description?.trim() || null;
  }
  if (data.secret !== undefined) {
    updateData.secret = data.secret.trim();
  }
  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive;
    if (data.isActive) {
      updateData.disabledAt = null;
      updateData.disabledReason = null;
      updateData.consecutiveFailures = 0;
    }
  }

  return prisma.webhookSubscription.update({
    where: { id },
    data: updateData
  });
}

export async function deleteSubscription(workspaceId: string, id: string) {
  const sub = await prisma.webhookSubscription.findFirst({
    where: { id, workspaceId }
  });
  if (!sub) throw new Error('Webhook aboneliği bulunamadı.');

  return prisma.webhookSubscription.delete({ where: { id } });
}

export async function listDeliveries(
  workspaceId: string,
  opts: {
    subscriptionId?: string;
    status?: string;
    take?: number;
  } = {}
) {
  const where: any = { workspaceId };
  if (opts.subscriptionId) where.subscriptionId = opts.subscriptionId;
  if (opts.status) where.status = opts.status;

  return prisma.webhookDelivery.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 50
  });
}

export async function sendTestPing(workspaceId: string, subscriptionId: string): Promise<DeliveryResult> {
  const sub = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, workspaceId }
  });
  if (!sub) throw new Error('Abonelik bulunamadı.');

  const payload: WebhookPayload = {
    id: `del_test_${randomBytes(8).toString('hex')}`,
    event: 'ping',
    timestamp: new Date().toISOString(),
    workspaceId,
    data: { message: 'SocialFlow AI Webhook Test Ping' }
  };

  const delivery = await prisma.webhookDelivery.create({
    data: {
      id: payload.id,
      workspaceId,
      subscriptionId: sub.id,
      event: 'ping',
      payload: JSON.stringify(payload),
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3
    }
  });

  return executeWebhookDelivery(delivery.id);
}
