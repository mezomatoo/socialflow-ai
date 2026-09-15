import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { AiPlannerView } from './AiPlannerView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI İçerik Planlayıcı' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const ws = session.user.workspaceId;
  const brands: any[] = await prisma.brand.findMany({ where: { workspaceId: ws }, orderBy: { name: 'asc' } }).catch(()=> []);
  const safe = brands.length ? brands : [{ id: 'demo-brand-id', name: 'Kahve Dükkanı' }, { id: 'demo-brand2-id', name: 'Aurora Tekstil' }];
  return <AiPlannerView brands={JSON.parse(JSON.stringify(safe))} demoMode={session.user.demoMode} />;
}
