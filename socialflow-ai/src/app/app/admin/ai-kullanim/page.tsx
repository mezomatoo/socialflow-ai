import { redirect } from 'next/navigation';
import { getSession, hasRole } from '@/lib/auth/session';
import { AiUsageView } from './AiUsageView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Kullanımı · SocialFlow AI' };

export default async function AiUsagePage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Yönetici görünümü (§114): yalnız ADMIN ve OWNER.
  if (!hasRole(session.user.role, 'ADMIN')) redirect('/app/dashboard');
  return <AiUsageView />;
}
