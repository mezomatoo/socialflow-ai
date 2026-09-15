import { apiRoute, ok, badRequest } from '@/lib/api';
import prisma from '@/lib/prisma';
import { retryPlatformContent } from '@/lib/social/publishingService';

/** "Tekrar Dene" — yalnızca başarısız hedefler. */
export const POST = apiRoute(
  async (request, { session, params }) => {
    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.platformContentIds) && body.platformContentIds.length
      ? body.platformContentIds.map(String)
      : (
          await prisma.platformContent.findMany({
            where: { contentId: params.id, status: 'FAILED', content: { workspaceId: session.user.workspaceId } },
            select: { id: true }
          })
        ).map((r) => r.id);

    if (!ids.length) return badRequest('Yeniden denenecek başarısız hedef bulunamadı.');

    const results = [];
    for (const id of ids) {
      results.push(
        await retryPlatformContent(id, {
          workspaceId: session.user.workspaceId,
          userId: session.user.id,
          demoMode: session.user.demoMode
        })
      );
    }
    return ok({ results, ready: results.filter((r) => r.ok).length, total: results.length });
  },
  { limit: 30 }
);
