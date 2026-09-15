import { redirect } from 'next/navigation';
import { getSession, hasRole } from '@/lib/auth/session';
import { listAdminProviderIntegrations } from '@/lib/social/providerConfigService';
import { AdminIntegrationsView } from './AdminIntegrationsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Platform Entegrasyonları · Yönetim' };

export default async function AdminIntegrationsPage() {
  const session = await getSession();
  if (!session) redirect('/giris');

  // Yalnızca OWNER ve ADMIN rolü erişebilir (§4).
  if (!hasRole(session.user.role, 'ADMIN')) {
    redirect('/app/dashboard');
  }

  const items = await listAdminProviderIntegrations();

  return <AdminIntegrationsView initialItems={JSON.parse(JSON.stringify(items))} />;
}
