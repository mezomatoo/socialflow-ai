import { apiRoute, ok, badRequest } from '@/lib/api';
import { saveVariant, parseVariants } from '@/lib/services/mediaService';
import prisma from '@/lib/prisma';
import { safeJson } from '@/lib/services/mediaSerializer';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Render edilmiş varyantı (blob) kaydeder. */
export const POST = apiRoute(
  async (request, { session, params }) => {
    const form = await request.formData();
    const blob = form.get('blob');
    if (!(blob instanceof Blob)) return badRequest('Varyant dosyası gönderilmedi.');
    const asset = await prisma.mediaAsset.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!asset) return badRequest('Medya bulunamadı.');

    const buf = Buffer.from(await blob.arrayBuffer());
    const saved = await saveVariant({
      workspaceId: session.user.workspaceId,
      mediaId: params.id,
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

    return ok({ storageKey: saved.storageKey, publicUrl: saved.publicUrl, derivatives: parseVariants(saved.asset.derivatives) });
  },
  { limit: 120 }
);
