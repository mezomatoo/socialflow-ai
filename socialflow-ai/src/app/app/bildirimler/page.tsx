import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { NotificationsView } from './NotificationsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bildirimler' };

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/giris');

  const items = await prisma.notification.findMany({
    where: {
      workspaceId: session.user.workspaceId,
      OR: [{ userId: session.user.id }, { userId: null }]
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      severity: true,
      readAt: true,
      actionLabel: true,
      actionRoute: true,
      contentId: true,
      createdAt: true
    }
  });

  return (
    <NotificationsView
      items={JSON.parse(
        JSON.stringify(
          items.map((n) => ({
            ...n,
            readAt: n.readAt ? new Date(n.readAt).toISOString() : null,
            createdAt: new Date(n.createdAt).toISOString()
          }))
        )
      )}
      timezone={session.user.timezone}
    />
  );
}
