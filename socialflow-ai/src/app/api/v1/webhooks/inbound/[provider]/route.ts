import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWebhookSignature,
  validWebhookTimestamp,
  verifyWebhookSubscription,
  resolveProviderWebhookSecret,
  recordInboundEvent
} from '@/lib/webhooks/incoming';

export const dynamic = 'force-dynamic';

/**
 * GET: Sağlayıcı webhook abonelik doğrulama isteği (Meta hub.challenge vb.).
 */
export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const provider = params.provider;
  const searchParams = request.nextUrl.searchParams;

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken =
    process.env[`${provider.toUpperCase()}_WEBHOOK_VERIFY_TOKEN`] ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.WEBHOOK_VERIFY_TOKEN ||
    resolveProviderWebhookSecret(provider);

  const verified = verifyWebhookSubscription({
    mode,
    token,
    expectedToken,
    challenge
  });

  if (verified !== null) {
    return new Response(verified, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }

  return NextResponse.json({ error: 'Geçersiz doğrulama isteği' }, { status: 403 });
}

/**
 * POST: Sağlayıcı olay bildirimi (imza doğrulama + event deduplication).
 */
export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  const provider = params.provider.toUpperCase();
  const secret = resolveProviderWebhookSecret(provider);

  if (!secret) {
    return NextResponse.json(
      { error: `${provider} sağlayıcısı için webhook gizli anahtarı yapılandırılmamış.` },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const rawBuf = Buffer.from(rawBody, 'utf8');

  // Gövde boyutu sınırı (256 KB)
  if (rawBuf.length > 256 * 1024) {
    return NextResponse.json({ error: 'Payload çok büyük' }, { status: 413 });
  }

  // İmza başlıkları
  const signature =
    request.headers.get('x-hub-signature-256') ||
    request.headers.get('x-signature-256') ||
    request.headers.get('x-provider-signature') ||
    request.headers.get('x-webhook-signature');

  if (!signature || !verifyWebhookSignature(rawBuf, signature, secret)) {
    return NextResponse.json({ error: 'Geçersiz webhook imzası' }, { status: 401 });
  }

  // Zaman damgası denetimi (varsa)
  const timestampHeader =
    request.headers.get('x-hub-timestamp') ||
    request.headers.get('x-timestamp') ||
    request.headers.get('x-request-timestamp');

  if (timestampHeader && !validWebhookTimestamp(timestampHeader)) {
    return NextResponse.json({ error: 'Süresi geçmiş veya geçersiz zaman damgası' }, { status: 400 });
  }

  let bodyJson: any = {};
  try {
    bodyJson = JSON.parse(rawBody);
  } catch {
    bodyJson = { raw: rawBody };
  }

  // Event ID çıkarma stratejisi (sağlayıcıya göre Meta entry[0].id / X id / genel event_id)
  const eventId = String(
    request.headers.get('x-event-id') ||
      request.headers.get('x-delivery-id') ||
      bodyJson.id ||
      bodyJson.event_id ||
      bodyJson.delivery_id ||
      bodyJson.entry?.[0]?.id ||
      bodyJson.entry?.[0]?.changes?.[0]?.value?.id ||
      `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  );

  const eventType = String(
    request.headers.get('x-event-type') ||
      bodyJson.event ||
      bodyJson.type ||
      bodyJson.entry?.[0]?.changes?.[0]?.field ||
      'webhook.event'
  );

  const record = await recordInboundEvent({
    provider,
    eventId,
    eventType,
    rawBody: rawBuf
  });

  return NextResponse.json({
    received: true,
    provider: record.provider,
    eventId: record.eventId,
    duplicate: record.duplicate,
    status: record.duplicate ? 'duplicate_acknowledged' : 'queued'
  });
}
