import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { fetchBrandOptions, fetchContentList } from '@/lib/services/contentListServer';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { ContentListView } from '@/components/content/ContentListView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Planlananlar' };

export default async function ScheduledPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Faz kapısı (§3): modül kapalıysa çalışıyormuş gibi gösterilmez.
  if (!isModuleEnabled('scheduling')) {
    return <PhaseGateNotice module="scheduling" phase1Alternatives={[{ href: '/app/icerik/taslaklar', label: 'Taslaklar' }]} />;
  }
  const ws = session.user.workspaceId;

  const [items, brands] = await Promise.all([
    fetchContentList(ws, ['SCHEDULED', 'PUBLISHING']),
    fetchBrandOptions(ws)
  ]);

  return (
    <ContentListView
      items={JSON.parse(JSON.stringify(items))}
      brands={JSON.parse(JSON.stringify(brands))}
      title="Planlananlar"
      subtitle="İleri bir tarihe planlanmış ve yayın kuyruğunda bekleyen içerikler."
      emptyTitle="Planlanmış içerik yok"
      emptyDescription="Bir içeriği açıp tarih ve saat vererek yayın kuyruğuna ekleyebilirsiniz."
      timezone={session.user.timezone}
      demoMode={session.user.demoMode}
      dateMode="scheduled"
    />
  );
}
