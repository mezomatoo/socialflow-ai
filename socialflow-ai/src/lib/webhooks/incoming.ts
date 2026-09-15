/**
 * Webhook Güvenlik Temeli ve Sağlayıcı Callback Ingestion İskeleti (§78)
 * ---------------------------------------------------------------------------
 * 1. Sağlayıcı callback imza doğrulama (HMAC-SHA256, timingSafeEqual).
 * 2. Zaman damgası doğrulaması (replay attack koruması).
 * 3. Event-ID bazlı kalıcı tekilleştirme (deduplication) iskeleti.
 * 4. Arka plan iş kuyruğuna idempotent aktarım.
 */

import { createHmac, createHash, timingSafeEqual } from 'crypto';
import prisma from '../prisma';
import { enqueue } from '../queue/queue';
import { env } from '../env';

export interface InboundWebhookRecord {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  payloadHash: string;
  status: string;
  duplicate: boolean;
  duplicateMismatch?: boolean;
}

/**
 * Sağlayıcı HMAC-SHA256 imzasını zamanlama saldırılarına karşı güvenli (constant-time) doğrular.
 * `sha256=<hex>` formatını veya doğrudan 64 karakter hex dizesini kabul eder.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!secret || !signature) return false;
  const buf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;

  let hexSignature = signature.trim();
  if (hexSignature.startsWith('sha256=')) {
    hexSignature = hexSignature.slice(7);
  }
  if (!/^[a-f0-9]{64}$/i.test(hexSignature)) return false;

  const expectedHmac = createHmac('sha256', secret).update(buf).digest();
  const providedHmac = Buffer.from(hexSignature, 'hex');

  if (expectedHmac.length !== providedHmac.length) return false;
  return timingSafeEqual(expectedHmac, providedHmac);
}

/**
 * Webhook zaman damgası geçerlilik denetimi (yeniden oynatma / replay saldırısı koruması).
 * Meta 36 saate kadar yeniden deneme yapabilir; varsayılan tolerans buna uygundur.
 */
export function validWebhookTimestamp(
  timestamp: unknown,
  opts: {
    now?: number;
    maxAgeMs?: number;
    maxFutureMs?: number;
  } = {}
): boolean {
  if (typeof timestamp !== 'number' && typeof timestamp !== 'string') return false;
  const num = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  if (!Number.isFinite(num) || num <= 0) return false;

  const now = opts.now ?? Date.now();
  // Saniye cinsinden gelmişse milisaniyeye çevir
  const tsMs = num < 1e11 ? num * 1000 : num;

  const maxAgeMs = opts.maxAgeMs ?? 36 * 60 * 60 * 1000; // Varsayılan 36 saat
  const maxFutureMs = opts.maxFutureMs ?? 5 * 60 * 1000; // Geleceğe yönelik en fazla 5 dk saat farkı toleransı

  return tsMs <= now + maxFutureMs && tsMs >= now - maxAgeMs;
}

/**
 * Meta (Facebook/Instagram) GET challenge abonelik doğrulama isteği.
 */
export function verifyWebhookSubscription(params: {
  mode: string | null;
  token: string | null;
  expectedToken: string;
  challenge: string | null;
}): string | null {
  if (params.mode === 'subscribe' && params.token && params.expectedToken && params.token === params.expectedToken) {
    return params.challenge ?? '';
  }
  return null;
}

/**
 * Sağlayıcı bazlı webhook doğrulama gizli anahtarını çözer.
 */
export function resolveProviderWebhookSecret(provider: string): string {
  const p = provider.toUpperCase();
  return (
    process.env[`${p}_WEBHOOK_SECRET`] ||
    process.env[`${p}_APP_SECRET`] ||
    process.env[`${p}_CLIENT_SECRET`] ||
    env.providers[p]?.secret ||
    process.env.WEBHOOK_SECRET ||
    ''
  );
}

/**
 * Gelen sağlayıcı callback olayını doğrular ve tekilleştirir (event-id dedupe skeleton).
 * - Aynı sağlayıcı ve eventId daha önce işlendiyse `duplicate: true` döner ve çift iş kuyruğa atılmaz.
 * - Farklı payload ile aynı eventId gelirse `duplicateMismatch: true` döner.
 * - Yeni bir olay ise veritabanına `InboundWebhookEvent` olarak kaydedilir ve `InboundWebhookJob` kuyruğa iletilir.
 */
export async function recordInboundEvent(params: {
  provider: string;
  eventId: string;
  eventType: string;
  rawBody: string | Buffer;
  workspaceId?: string | null;
}): Promise<InboundWebhookRecord> {
  const provider = params.provider.toUpperCase().trim();
  const eventId = params.eventId.trim();
  const eventType = params.eventType.trim() || 'generic';
  const rawStr = typeof params.rawBody === 'string' ? params.rawBody : params.rawBody.toString('utf8');
  const payloadHash = createHash('sha256').update(rawStr).digest('hex');

  // 1) Mevcut kaydı denetle (atomic tekilleştirme)
  const existing = await prisma.inboundWebhookEvent.findUnique({
    where: { provider_eventId: { provider, eventId } }
  });

  if (existing) {
    const isMismatch = existing.payloadHash !== payloadHash;
    return {
      id: existing.id,
      provider: existing.provider,
      eventId: existing.eventId,
      eventType: existing.eventType,
      payloadHash: existing.payloadHash,
      status: existing.status,
      duplicate: true,
      duplicateMismatch: isMismatch
    };
  }

  // 2) Yeni olay kaydı ve kuyruk entegrasyonu
  const sanitizedPayload = rawStr.length > 8192 ? rawStr.slice(0, 8192) + '...[truncated]' : rawStr;

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.inboundWebhookEvent.create({
      data: {
        workspaceId: params.workspaceId ?? null,
        provider,
        eventId,
        eventType,
        payloadHash,
        status: 'PENDING',
        rawPayload: sanitizedPayload
      }
    });

    await tx.job.create({
      data: {
        workspaceId: params.workspaceId ?? null,
        type: 'InboundWebhookJob',
        payload: JSON.stringify({
          inboundEventId: created.id,
          provider,
          eventId,
          eventType
        }),
        idempotencyKey: `inbound:${provider}:${eventId}`,
        maxAttempts: 3
      }
    });

    return created;
  });

  return {
    id: event.id,
    provider: event.provider,
    eventId: event.eventId,
    eventType: event.eventType,
    payloadHash: event.payloadHash,
    status: event.status,
    duplicate: false
  };
}

/**
 * Kuyruk işçisinin çağırdığı inbound webhook olay işleyicisi (idempotent skeleton).
 */
export async function processInboundWebhook(inboundEventId: string): Promise<{ success: boolean; event: InboundWebhookRecord }> {
  const event = await prisma.inboundWebhookEvent.findUnique({ where: { id: inboundEventId } });
  if (!event) throw new Error(`Inbound webhook olayı bulunamadı: ${inboundEventId}`);

  if (event.status === 'PROCESSED') {
    return {
      success: true,
      event: {
        id: event.id,
        provider: event.provider,
        eventId: event.eventId,
        eventType: event.eventType,
        payloadHash: event.payloadHash,
        status: event.status,
        duplicate: true
      }
    };
  }

  // İşleme mantığı: Olay türüne göre ilgili servislere yönlendirilebilir
  // (gelen kutusu olayları, hesap sağlık güncellemeleri, yayın durumu vb.)
  const updated = await prisma.inboundWebhookEvent.update({
    where: { id: inboundEventId },
    data: {
      status: 'PROCESSED',
      processedAt: new Date()
    }
  });

  return {
    success: true,
    event: {
      id: updated.id,
      provider: updated.provider,
      eventId: updated.eventId,
      eventType: updated.eventType,
      payloadHash: updated.payloadHash,
      status: updated.status,
      duplicate: false
    }
  };
}
