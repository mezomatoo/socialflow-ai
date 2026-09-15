import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { AnalyticsView } from './AnalyticsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analizler' };

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Faz kapısı (§3): modül kapalıysa çalışıyormuş gibi gösterilmez.
  if (!isModuleEnabled('analytics')) {
    return <PhaseGateNotice module="analytics" phase1Alternatives={[{ href: '/app/icerik/taslaklar', label: 'Taslaklar' }]} />;
  }
  const brands = await prisma.brand.findMany({
    where: { workspaceId: session.user.workspaceId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true }
  });
  return (
    <AnalyticsView
      brands={JSON.parse(JSON.stringify(brands))}
      timezone={session.user.timezone}
    />
  );
}
