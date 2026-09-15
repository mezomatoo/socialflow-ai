import prisma from '../prisma';

/**
 * NotificationService — uygulama içi bildirim merkezi.
 * Tüm mesajlar Türkçe ve kullanıcı tarafından anlaşılır olmalıdır.
 */

export type NotificationType =
  | 'INFO'
  | 'PUBLISHED'
  | 'PUBLICATION_PARTIAL_SUCCESS'
  | 'PUBLISH_FAILED'
  | 'TOKEN_EXPIRING'
  | 'SCHEDULED'
  | 'DRAFT'
  | 'APPROVAL'
  | 'ACCOUNT'
  | 'ACCOUNT_REAUTH'
  | 'SYSTEM'
  | 'REMINDER';

export type Severity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface NotificationInput {
  type: NotificationType | string;
  title: string;
  message: string;
  severity?: Severity;
  userId?: string | null;
  contentId?: string | null;
  actionLabel?: string | null;
  actionRoute?: string | null;
}

export async function notify(workspaceId: string, input: NotificationInput) {
  try {
    return await prisma.notification.create({
      data: {
        workspaceId,
        userId: input.userId ?? null,
        contentId: input.contentId ?? null,
        type: input.type,
        title: input.title.slice(0, 200),
        message: input.message.slice(0, 600),
        severity: input.severity ?? 'INFO',
        actionLabel: input.actionLabel ?? null,
        actionRoute: input.actionRoute ?? null
      }
    });
  } catch (err) {
    console.error('[notify] bildirim oluşturulamadı', err);
    return null;
  }
}

export async function listNotifications(workspaceId: string, options: { userId?: string; unreadOnly?: boolean; limit?: number } = {}) {
  return prisma.notification.findMany({
    where: {
      workspaceId,
      ...(options.unreadOnly ? { readAt: null } : {}),
      ...(options.userId ? { OR: [{ userId: options.userId }, { userId: null }] } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 50
  });
}

export async function markRead(workspaceId: string, ids: string[]) {
  if (!ids.length) return 0;
  const res = await prisma.notification.updateMany({
    where: { id: { in: ids }, workspaceId },
    data: { readAt: new Date() }
  });
  return res.count;
}

export async function markAllRead(workspaceId: string, userId?: string) {
  const res = await prisma.notification.updateMany({
    where: { workspaceId, readAt: null, ...(userId ? { OR: [{ userId }, { userId: null }] } : {}) },
    data: { readAt: new Date() }
  });
  return res.count;
}

export async function unreadCount(workspaceId: string, userId?: string) {
  return prisma.notification.count({
    where: { workspaceId, readAt: null, ...(userId ? { OR: [{ userId }, { userId: null }] } : {}) }
  });
}
