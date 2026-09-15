import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { fetchBrandOptions, fetchContentList } from '@/lib/services/contentListServer';
import { ContentListView } from '@/components/content/ContentListView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Taslaklar' };

export default async function DraftsPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const ws = session.user.workspaceId;

  const [items, brands] = await Promise.all([
    fetchContentList(ws, ['DRAFT', 'APPROVAL_PENDING']),
    fetchBrandOptions(ws)
  ]);

  return (
    <ContentListView
      items={JSON.parse(JSON.stringify(items))}
      brands={JSON.parse(JSON.stringify(brands))}
      title="Taslaklar"
      subtitle="Henüz yayınlanmamış, üzerinde çalıştığınız içerikler ve onay bekleyenler."
      emptyTitle="Taslak içerik yok"
      emptyDescription="Yeni bir içerik oluşturduğunuzda taslak olarak burada görünür."
      timezone={session.user.timezone}
      dateMode="updated"
    />
  );
}
