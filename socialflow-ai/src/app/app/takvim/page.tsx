import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { CalendarView } from './CalendarView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'İçerik Takvimi' };

export default async function CalendarPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const brands = await prisma.brand.findMany({
    where: { workspaceId: session.user.workspaceId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, primaryColor: true }
  });
  return (
    <CalendarView
      brands={JSON.parse(JSON.stringify(brands))}
      timezone={session.user.timezone}
      demoMode={session.user.demoMode}
    />
  );
}
