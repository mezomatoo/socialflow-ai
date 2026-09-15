import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { fetchBrandOptions, fetchContentList } from '@/lib/services/contentListServer';
import { ContentListView } from '@/components/content/ContentListView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Yayınlananlar' };

export default async function PublishedPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
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
      demoMode={session.user.demoMode}
      dateMode="published"
    />
  );
}
