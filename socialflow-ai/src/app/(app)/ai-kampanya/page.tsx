import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { AiCampaignView } from './AiCampaignView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Kampanya Oluşturucu' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const ws = session.user.workspaceId;
  const brands: any[] = await prisma.brand.findMany({ where: { workspaceId: ws } }).catch(()=> []);
  const safe = brands.length ? brands : [{ id: 'demo-brand-id', name: 'Kahve Dükkanı' }];
  return <AiCampaignView brands={JSON.parse(JSON.stringify(safe))} demoMode={session.user.demoMode} />;
}
