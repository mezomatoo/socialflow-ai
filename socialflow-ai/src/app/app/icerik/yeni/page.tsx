import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { listMedia } from '@/lib/services/mediaService';
import { serializeMedia } from '@/lib/services/mediaSerializer';
import { PLATFORM_LIST } from '@/lib/platforms/platforms';
import { NewContentView } from './NewContentView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Yeni İçerik' };

export default async function NewContentPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const ws = session.user.workspaceId;

  const [brands, accounts, media] = await Promise.all([
    prisma.brand.findMany({
      where: { workspaceId: ws },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, primaryColor: true, defaultStyle: true, defaultCta: true, website: true }
    }),
    prisma.socialAccount.findMany({
      where: { workspaceId: ws, connectionStatus: 'ACTIVE' },
      select: { id: true, platform: true, handle: true, displayName: true, demoAccount: true, accountType: true },
      orderBy: { createdAt: 'asc' }
    }),
    listMedia(ws, { limit: 120 })
  ]);

  const platforms = PLATFORM_LIST.map((p) => ({
    code: p.code,
    name: p.name,
    shortName: p.shortName,
    color: p.brandColor,
    contentTypes: p.contentTypes.map((ct) => ({
      code: ct,
      label: p.contentTypeLabels?.[ct as keyof typeof p.contentTypeLabels] ?? ct
    }))
  }));

  return (
    <NewContentView
      brands={JSON.parse(JSON.stringify(brands))}
      accounts={JSON.parse(JSON.stringify(accounts))}
      media={JSON.parse(JSON.stringify(media.map(serializeMedia)))}
      platforms={JSON.parse(JSON.stringify(platforms))}
      timezone={session.user.timezone}
      demoMode={session.user.demoMode}
    />
  );
}
