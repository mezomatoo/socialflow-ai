import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { AutomationsView } from './AutomationsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Otomasyonlar' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  return <AutomationsView demoMode={session.user.demoMode} />;
}
