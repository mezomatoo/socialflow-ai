import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { AiCampaignView } from './AiCampaignView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Kampanya Oluşturucu' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const brands = await prisma.brand.findMany({
    where: { workspaceId: session.user.workspaceId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true }
  });
  return <AiCampaignView brands={brands} />;
}
