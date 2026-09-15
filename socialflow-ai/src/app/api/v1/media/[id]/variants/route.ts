import { apiRoute, ok, badRequest } from '@/lib/api';
import { createMediaVariant, listMediaVariants, mediaUsage } from '@/lib/services/mediaProcessingService';
import { notFound } from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Bir medyanın üretilmiş tüm türevleri + kullanım bilgisi. */
export const GET = apiRoute(async (_request, { session, params }) => {
  const variants = await listMediaVariants(session.user.workspaceId, params.id);
  const usage = await mediaUsage(session.user.workspaceId, params.id);
  return ok({ variants, usage });
});

/**
 * Türev kaydı oluşturur. İkili veri `blob` alanıyla (multipart) gönderilirse
 * doğrudan yazılır; gönderilmezse PENDING kaydı açılır ve işlemeyi bekler.
 */
export const POST = apiRoute(
  async (request, { session, params }) => {
    const contentTypeHeader = request.headers.get('content-type') ?? '';
    let payload: Record<string, unknown> = {};
    let bytes: Buffer | null = null;
    let mimeType: string | null = null;

    if (contentTypeHeader.includes('multipart/form-data')) {
      const form = await request.formData();
      const blob = form.get('blob');
      if (blob instanceof Blob) {
        bytes = Buffer.from(await blob.arrayBuffer());
        mimeType = blob.type || 'image/jpeg';
      }
      for (const [key, value] of form.entries()) {
        if (key === 'blob') continue;
        payload[key] = typeof value === 'string' ? value : String(value);
      }
    } else {
      payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    }

    const aspectRatio = payload.aspectRatio ? String(payload.aspectRatio) : null;
    if (bytes && !aspectRatio) return badRequest('En-boy oranı (aspectRatio) zorunludur.');

    const variant = await createMediaVariant({
      workspaceId: session.user.workspaceId,
      mediaAssetId: params.id,
      platform: payload.platform ? String(payload.platform) : null,
      contentType: payload.contentType ? String(payload.contentType) : null,
      kind: (payload.kind as 'CROP' | 'SCALE' | 'THUMBNAIL' | 'COVER' | 'VIDEO_POSTER') ?? 'CROP',
      aspectRatio,
      bytes,
      mimeType,
      width: payload.width !== undefined ? Number(payload.width) : null,
      height: payload.height !== undefined ? Number(payload.height) : null,
      focalPoint: payload.focalPoint ? (typeof payload.focalPoint === 'string' ? JSON.parse(payload.focalPoint) : (payload.focalPoint as any)) : null,
      cropMode: (payload.cropMode as 'SMART' | 'MANUAL' | 'FIT') ?? 'SMART',
      processingMethod: (payload.processingMethod as 'DETERMINISTIC' | 'USER_FOCAL_POINT' | 'AI_SALIENCY') ?? 'DETERMINISTIC',
      crop: payload.crop ? (typeof payload.crop === 'string' ? JSON.parse(payload.crop) : (payload.crop as any)) : null,
      createdById: session.user.id
    });

    return ok({ variant }, { status: 201 });
  },
  { limit: 120 }
);

/** Tek bir türevi siler — orijinal medya ve diğer türevler korunur. (#) */
export const DELETE = apiRoute(
  async (request, { session, params }) => {
    const variantId = new URL(request.url).searchParams.get('variantId');
    if (!variantId) return badRequest('Silinecek türev belirtilmedi.');
    const { deleteMediaVariant } = await import('@/lib/services/mediaProcessingService');
    const existing = await listMediaVariants(session.user.workspaceId, params.id);
    if (!existing.some((v) => v.id === variantId)) throw notFound('Medya varyantı bulunamadı.');
    return ok(await deleteMediaVariant(session.user.workspaceId, variantId));
  },
  { limit: 60 }
);
