import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { AnalyticsView } from './AnalyticsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analizler' };

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const brands = await prisma.brand.findMany({
    where: { workspaceId: session.user.workspaceId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true }
  });
  return (
    <AnalyticsView
      brands={JSON.parse(JSON.stringify(brands))}
      timezone={session.user.timezone}
      demoMode={session.user.demoMode}
    />
  );
}
