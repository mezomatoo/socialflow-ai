import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { CalendarView } from './CalendarView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'İçerik Takvimi' };

export default async function CalendarPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Faz kapısı (§3): modül kapalıysa çalışıyormuş gibi gösterilmez.
  if (!isModuleEnabled('scheduling')) {
    return <PhaseGateNotice module="scheduling" phase1Alternatives={[{ href: '/app/icerik/taslaklar', label: 'Taslaklar' }]} />;
  }
  const brands = await prisma.brand.findMany({
    where: { workspaceId: session.user.workspaceId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, primaryColor: true }
  });
  return (
    <CalendarView
      brands={JSON.parse(JSON.stringify(brands))}
      timezone={session.user.timezone}
    />
  );
}
