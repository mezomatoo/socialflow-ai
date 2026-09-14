import { apiRoute, ok, badRequest } from '@/lib/api';
import { uploadMedia, saveVariant } from '@/lib/services/mediaService';
import { enqueue } from '@/lib/queue/queue';
import { serializeMedia, safeJson } from '@/lib/services/mediaSerializer';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Medya yükleme.
 * - `file`: orijinal master dosya (asla değiştirilmez)
 * - `variant`: platforma özel render edilmiş varyant (parentMediaId ile ilişkilendirilir)
 */
export const POST = apiRoute(
  async (request, { session }) => {
    const form = await request.formData();
    const mode = String(form.get('mode') ?? 'original');

    if (mode === 'variant') {
      const parentMediaId = String(form.get('parentMediaId') ?? '');
      const blob = form.get('blob');
      if (!(blob instanceof Blob)) return badRequest('Varyant dosyası gönderilmedi.');
      const buf = Buffer.from(await blob.arrayBuffer());
      const saved = await saveVariant({
        workspaceId: session.user.workspaceId,
        mediaId: parentMediaId,
        platform: String(form.get('platform') ?? ''),
        contentType: String(form.get('contentType') ?? ''),
        ratio: String(form.get('ratio') ?? '1:1'),
        width: Number(form.get('width') ?? 0),
        height: Number(form.get('height') ?? 0),
        bytes: buf,
        mimeType: blob.type || 'image/jpeg',
        crop: safeJson(form.get('crop')),
        method: (form.get('method') as any) ?? 'SMART_CROP',
        focalPoint: safeJson(form.get('focalPoint'))
      });
      return ok({ mode: 'variant', storageKey: saved.storageKey, publicUrl: saved.publicUrl, asset: serializeMedia(saved.asset) });
    }

    const file = form.get('file');
    if (!(file instanceof File)) return badRequest('Dosya gönderilmedi.');
    if (file.size === 0) return badRequest('Dosya boş.');
    if (file.size > 512 * 1024 * 1024) return badRequest('Dosya boyutu 512 MB sınırını aşıyor.');

    const buf = Buffer.from(await file.arrayBuffer());
    const { asset, deduplicated } = await uploadMedia({
      workspaceId: session.user.workspaceId,
      brandId: form.get('brandId') ? String(form.get('brandId')) : null,
      folderId: form.get('folderId') ? String(form.get('folderId')) : null,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      bytes: buf,
      width: form.get('width') ? Number(form.get('width')) : null,
      height: form.get('height') ? Number(form.get('height')) : null,
      durationMs: form.get('durationMs') ? Number(form.get('durationMs')) : null,
      focalPoint: safeJson(form.get('focalPoint')),
      analysis: safeJson(form.get('analysis')),
      tags: form.get('tags') ? String(form.get('tags')).split(',').map((s) => s.trim()).filter(Boolean) : [],
      campaign: form.get('campaign') ? String(form.get('campaign')) : null,
      kind: (form.get('kind') as any) ?? undefined,
      createdBy: session.user.id
    });

    if (!deduplicated) {
      await enqueue({
        type: 'MediaProcessingJob',
        idempotencyKey: `media-process:${asset.id}`,
        workspaceId: session.user.workspaceId,
        payload: { mediaId: asset.id }
      }).catch(() => undefined);
    }

    return ok({ mode: 'original', deduplicated, asset: serializeMedia(asset) });
  },
  { limit: 40, windowMs: 60_000 }
);
