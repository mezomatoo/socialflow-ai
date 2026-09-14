import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { AiHistoryView } from './AiHistoryView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Geçmişi' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  return <AiHistoryView />;
}
