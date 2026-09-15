import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { TrendsView } from './TrendsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Trendler' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  return <TrendsView />;
}
