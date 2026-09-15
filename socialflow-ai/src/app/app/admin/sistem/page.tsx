import { redirect } from 'next/navigation';
import { getSession, hasRole } from '@/lib/auth/session';
import { gatherSystemHealth } from '@/lib/ops/systemHealth';
import { SystemHealthView } from './SystemHealthView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sistem Durumu · SocialFlow AI' };

export default async function SystemHealthPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Yönetici operasyon görünümü (§114): yalnız ADMIN ve OWNER görür.
  if (!hasRole(session.user.role, 'ADMIN')) redirect('/app/dashboard');

  const snapshot = await gatherSystemHealth(session.user.workspaceId);
  return <SystemHealthView snapshot={snapshot} />;
}
