import { apiRoute, ok } from '@/lib/api';
import prisma from '@/lib/prisma';
import { unreadCount } from '@/lib/services/notifications';
import { isModuleEnabled, moduleState } from '@/lib/phase/phaseGates';

/**
 * Uygulama kabuğunun ihtiyaç duyduğu sayaçlar, modül durumu ve oturum özeti.
 * Kapatılmış modüllerin sayaçları HESAPLANMAZ (çalışmayan modülün verisi
 * kullanıcıya gösterilmez — §3).
 */
export const GET = apiRoute(async (_request, { session }) => {
  const workspaceId = session.user.workspaceId;
  const notificationsEnabled = isModuleEnabled('notifications');
  const schedulingEnabled = isModuleEnabled('scheduling');

  const [drafts, scheduled, unread, accounts, brands] = await Promise.all([
    prisma.content.count({ where: { workspaceId, status: 'DRAFT' } }),
    schedulingEnabled
      ? prisma.platformContent.count({ where: { content: { workspaceId }, status: 'SCHEDULED' } })
      : Promise.resolve(0),
    notificationsEnabled ? unreadCount(workspaceId, session.user.id) : Promise.resolve(0),
    prisma.socialAccount.findMany({
      where: { workspaceId },
      select: { id: true, platform: true, handle: true, displayName: true, connectionStatus: true, demoAccount: true, avatarUrl: true, brandId: true, accountType: true }
    }),
    prisma.brand.findMany({
      where: { workspaceId },
      select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true, defaultStyle: true, isDefault: true }
    })
  ]);

  return ok({ drafts, scheduled, unread, accounts, brands, modules: moduleState(), user: session.user });
});
