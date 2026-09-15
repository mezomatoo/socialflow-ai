import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { CompetitorView } from './CompetitorView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rakip Analizi' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  return <CompetitorView />;
}
