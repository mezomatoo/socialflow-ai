import { INSTAGRAM_CONNECTION_MESSAGES } from '@/lib/social/instagramConnectionMessages';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { PLATFORM_LIST } from '@/lib/platforms/platforms';
import { AccountsView } from './AccountsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sosyal Medya Hesapları' };

export default async function AccountsPage({ searchParams }: { searchParams: { baglanti?: string } }) {
  const session = await getSession();
  if (!session) redirect('/giris');
  const ws = session.user.workspaceId;

  const [accounts, brands] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { workspaceId: ws },
      include: { brand: { select: { id: true, name: true, primaryColor: true } } },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.brand.findMany({ where: { workspaceId: ws }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
  ]);

  const items = accounts.map((a) => ({
    id: a.id,
    platform: a.platform,
    handle: a.handle,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl,
    accountType: a.accountType,
    connectionStatus: a.connectionStatus,
    demoAccount: a.demoAccount,
    lastError: a.lastError,
    brandId: a.brandId,
    brandName: a.brand?.name ?? null,
    brandColor: a.brand?.primaryColor ?? null,
    externalId: a.externalId,
    tokenExpiresAt: null as string | null
  }));

  return (
    <AccountsView
      connectionResult={searchParams.baglanti && Object.hasOwn(INSTAGRAM_CONNECTION_MESSAGES, searchParams.baglanti) ? INSTAGRAM_CONNECTION_MESSAGES[searchParams.baglanti as keyof typeof INSTAGRAM_CONNECTION_MESSAGES] : null}
      items={JSON.parse(JSON.stringify(items))}
      brands={JSON.parse(JSON.stringify(brands))}
      platforms={JSON.parse(JSON.stringify(PLATFORM_LIST.map((p) => ({ code: p.code, name: p.name, color: p.brandColor }))))}
      demoMode={session.user.demoMode}
    />
  );
}
