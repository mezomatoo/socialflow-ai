import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { listMedia } from '@/lib/services/mediaService';
import { serializeMedia } from '@/lib/services/mediaSerializer';
import { MediaView } from './MediaView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Medya Kütüphanesi' };

export default async function MediaPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const ws = session.user.workspaceId;

  const [media, brands] = await Promise.all([
    listMedia(ws, { limit: 120 }),
    prisma.brand.findMany({ where: { workspaceId: ws }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
  ]);

  return (
    <MediaView
      items={JSON.parse(JSON.stringify(media.map(serializeMedia)))}
      brands={JSON.parse(JSON.stringify(brands))}
    />
  );
}
