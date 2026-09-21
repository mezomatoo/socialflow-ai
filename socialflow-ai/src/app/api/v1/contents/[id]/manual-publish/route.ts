import { apiRoute, ok, badRequest } from '@/lib/api';
import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { assertRole } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { notify } from '@/lib/services/notifications';

/**
 * Manuel Yayın onayı — API'siz yayınlama akışının son adımı.
 * Kullanıcı içeriği platformda elle paylaştıktan sonra "Yayınlandı" der;
 * hedef(ler) PUBLISHED işaretlenir. İsteğe bağlı gönderi bağlantısı saklanır.
 */
export const POST = apiRoute(
  async (request, { session, params }) => {
    assertModuleEnabled('socialPublishing');
    assertRole(session, 'EDITOR');

    const content = await prisma.content.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!content) return badRequest('İçerik bulunamadı.');

    const body = await request.json().catch(() => ({}));
    const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim().slice(0, 2048) : null;
    const singleId = typeof body.platformContentId === 'string' ? body.platformContentId : null;

    const pending = await prisma.platformContent.findMany({
      where: {
        contentId: content.id,
        status: 'MANUAL_PENDING',
        ...(singleId ? { id: singleId } : {})
      }
    });
    if (pending.length === 0) return badRequest('Manuel onay bekleyen hedef bulunamadı.');

    await prisma.platformContent.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        permalink: url,
        externalPostId: `manual-${Date.now()}`,
        lastError: null,
        updatedAt: new Date()
      }
    });

    const { rollupContentStatus } = await import('@/lib/social/publishingService');
    const newStatus = await rollupContentStatus(content.id);

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'content.publish.manual_confirmed',
      entityType: 'Content',
      entityId: content.id,
      metadata: { targets: pending.length, url },
      request
    });
    await notify(session.user.workspaceId, {
      type: 'PUBLISHED',
      title: 'Manuel yayın tamamlandı',
      message: `${content.title || 'İçerik'} için ${pending.length} hedef elle yayınlandı olarak işaretlendi.`,
      actionRoute: `/app/icerik/${content.id}`
    });

    return ok({ confirmed: pending.length, contentStatus: newStatus });
  },
  { limit: 20 }
);
