import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { getDecryptedProviderConfig, PROVIDER_DEFAULT_CONFIGS } from '@/lib/social/providerConfigService';
import { AccountsView } from './AccountsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hesap Bağlantı Merkezi · SocialFlow AI' };

export default async function AccountsPage({
  searchParams
}: {
  searchParams: {
    baglanti?: string;
    session?: string;
    provider?: string;
    mesaj?: string;
    hata?: string;
  };
}) {
  const session = await getSession();
  if (!session) redirect('/giris');

  if (!isModuleEnabled('socialAccounts')) {
    return <PhaseGateNotice module="socialAccounts" phase1Alternatives={[{ href: '/app/markalar', label: 'Markalar' }]} />;
  }

  const ws = session.user.workspaceId;

  // Load social accounts, ad accounts, brands and provider readiness
  const [socialAccounts, adAccounts, brands] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { workspaceId: ws },
      include: {
        brand: { select: { id: true, name: true, primaryColor: true } },
        token: { select: { expiresAt: true, lastRefreshedAt: true, scope: true } }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.adAccount.findMany({
      where: { workspaceId: ws },
      include: {
        brand: { select: { id: true, name: true, primaryColor: true } },
        credential: { select: { expiresAt: true, lastRotatedAt: true } }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.brand.findMany({
      where: { workspaceId: ws },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, primaryColor: true }
    })
  ]);

  // Load readiness status for each supported provider
  const providerKeys = ['META', 'GOOGLE', 'LINKEDIN', 'TIKTOK', 'X', 'PINTEREST', 'SNAPCHAT', 'THREADS'];
  const providerConfigs = await Promise.all(providerKeys.map(k => getDecryptedProviderConfig(k)));

  const providerStatuses = providerConfigs.map(c => ({
    code: c.provider,
    name: PROVIDER_DEFAULT_CONFIGS[c.provider]?.name || c.provider,
    isConfigured: c.isConfigured,
    appReviewStatus: c.appReviewStatus,
    writeEnabled: c.writeEnabled,
    adsEnabled: c.adsEnabled,
    status: c.status
  }));

  const socialItems = socialAccounts.map(a => ({
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
    tokenExpiresAt: a.token?.expiresAt?.toISOString() ?? null,
    lastSyncedAt: a.lastSyncedAt ? a.lastSyncedAt.toISOString() : null
  }));

  const adItems = adAccounts.map(a => ({
    id: a.id,
    provider: a.provider,
    providerAccountId: a.providerAccountId,
    displayName: a.displayName,
    currency: a.currency,
    timezone: a.timezone,
    connectionStatus: a.connectionStatus,
    brandId: a.brandId,
    brandName: a.brand?.name ?? null,
    brandColor: a.brand?.primaryColor ?? null,
    tokenExpiresAt: a.credential?.expiresAt?.toISOString() ?? null,
    lastValidatedAt: a.lastValidatedAt?.toISOString() ?? null
  }));

  return (
    <AccountsView
      socialAccounts={JSON.parse(JSON.stringify(socialItems))}
      adAccounts={JSON.parse(JSON.stringify(adItems))}
      brands={JSON.parse(JSON.stringify(brands))}
      providers={providerStatuses}
      discoverySessionKey={searchParams.session ?? null}
      connectionResult={searchParams.baglanti ?? null}
      errorMessage={searchParams.mesaj ?? searchParams.hata ?? null}
      demoMode={session.user.demoMode}
    />
  );
}
