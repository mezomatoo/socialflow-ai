import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { AiUsageView } from './AiUsageView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Kullanımı · SocialFlow AI' };

export default async function AiUsagePage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  return <AiUsageView />;
}
