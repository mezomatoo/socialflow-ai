import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getDashboardStats } from '@/lib/services/analyticsService';
import prisma from '@/lib/prisma';
import { DashboardView } from './DashboardView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ana Sayfa' };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/giris');

  const workspaceId = session.user.workspaceId;
  const stats = await getDashboardStats(workspaceId, {
    timezone: session.user.timezone,
    demoMode: session.user.demoMode
  });

  const [brands, accounts, recentFailures] = await Promise.all([
    prisma.brand.findMany({
      where: { workspaceId },
      select: { id: true, name: true, primaryColor: true, logoUrl: true, isDefault: true }
    }),
    prisma.socialAccount.findMany({
      where: { workspaceId },
      select: { id: true, platform: true, handle: true, displayName: true, connectionStatus: true, demoAccount: true }
    }),
    prisma.platformContent.findMany({
      where: { content: { workspaceId }, status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, contentId: true, platform: true, contentType: true, lastError: true, updatedAt: true }
    })
  ]);

  return (
    <DashboardView
      stats={JSON.parse(JSON.stringify(stats))}
      brands={JSON.parse(JSON.stringify(brands))}
      accounts={JSON.parse(JSON.stringify(accounts))}
      recentFailures={JSON.parse(JSON.stringify(recentFailures))}
      user={{ name: session.user.name, workspaceName: session.user.workspaceName, timezone: session.user.timezone }}
      demoMode={session.user.demoMode}
    />
  );
}
