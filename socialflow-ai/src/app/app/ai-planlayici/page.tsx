import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { AiPlannerView } from './AiPlannerView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Planlayıcı' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const ws = session.user.workspaceId;

  const [brands, campaigns] = await Promise.all([
    prisma.brand.findMany({ where: { workspaceId: ws }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.campaign.findMany({ where: { workspaceId: ws }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, name: true } })
  ]);

  return <AiPlannerView brands={brands} campaigns={campaigns} demoMode={session.user.demoMode} />;
}
