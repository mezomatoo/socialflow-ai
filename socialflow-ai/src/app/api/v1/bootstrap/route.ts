import { apiRoute, ok } from '@/lib/api';
import prisma from '@/lib/prisma';
import { unreadCount } from '@/lib/services/notifications';

/** Uygulama kabuğunun ihtiyaç duyduğu sayaçlar ve oturum özeti. */
export const GET = apiRoute(async (_request, { session }) => {
  const workspaceId = session.user.workspaceId;
  const [drafts, scheduled, unread, accounts, brands] = await Promise.all([
    prisma.content.count({ where: { workspaceId, status: 'DRAFT' } }),
    prisma.platformContent.count({ where: { content: { workspaceId }, status: 'SCHEDULED' } }),
    unreadCount(workspaceId, session.user.id),
    prisma.socialAccount.findMany({
      where: { workspaceId },
      select: { id: true, platform: true, handle: true, displayName: true, connectionStatus: true, demoAccount: true, avatarUrl: true, brandId: true, accountType: true }
    }),
    prisma.brand.findMany({
      where: { workspaceId },
      select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true, defaultStyle: true, isDefault: true }
    })
  ]);

  return ok({ drafts, scheduled, unread, accounts, brands, user: session.user });
});
