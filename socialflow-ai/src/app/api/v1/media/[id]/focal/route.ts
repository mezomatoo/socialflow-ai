import { apiRoute, ok, badRequest } from '@/lib/api';
import { updateFocalPoint } from '@/lib/services/mediaService';
import prisma from '@/lib/prisma';

/** "Otomatik Odak Noktası" / elle yeniden konumlandırma. */
export const POST = apiRoute(
  async (request, { session, params }) => {
    const body = await request.json().catch(() => ({}));
    const asset = await prisma.mediaAsset.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!asset) return badRequest('Medya bulunamadı.');

    const focal = {
      x: Number(body.x ?? 0.5),
      y: Number(body.y ?? 0.5),
      method: body.method === 'AUTO' ? 'AUTO' : 'MANUAL'
    };
    await updateFocalPoint(params.id, session.user.workspaceId, focal as any);
    return ok({ focalPoint: focal });
  },
  { limit: 60 }
);
