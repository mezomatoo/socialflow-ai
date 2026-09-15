import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { fetchBrandOptions, fetchContentList } from '@/lib/services/contentListServer';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { ContentListView } from '@/components/content/ContentListView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Yayınlananlar' };

export default async function PublishedPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Faz kapısı (§3): modül kapalıysa çalışıyormuş gibi gösterilmez.
  if (!isModuleEnabled('socialPublishing')) {
    return <PhaseGateNotice module="socialPublishing" phase1Alternatives={[{ href: '/app/icerik/taslaklar', label: 'Taslaklar' }]} />;
  }
  const ws = session.user.workspaceId;

  const [items, brands] = await Promise.all([
    fetchContentList(ws, ['PUBLISHED', 'PARTIALLY_PUBLISHED', 'FAILED']),
    fetchBrandOptions(ws)
  ]);

  return (
    <ContentListView
      items={JSON.parse(JSON.stringify(items))}
      brands={JSON.parse(JSON.stringify(brands))}
      title="Yayınlananlar"
      subtitle="Yayınlanmış, kısmen yayınlanmış veya hata almış içerikler. Hatalı hedefler yeniden denenebilir."
      emptyTitle="Yayınlanmış içerik yok"
      emptyDescription="Planladığınız içerikler yayınlandıkça burada listelenir."
      timezone={session.user.timezone}
      dateMode="published"
    />
  );
}
