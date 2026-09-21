import { apiRoute, ok } from '@/lib/api';
import prisma from '@/lib/prisma';
import { env } from '@/lib/env';
import { PLATFORMS, PLATFORM_META, INTEGRATION_STATUS_LABELS } from '@/lib/platforms/platforms';
import { resolveProviderCredentials } from '@/lib/social/workspaceCredentials';

/**
 * Entegrasyon Durumu sayfası.
 * Durumlar: Bağlı · Yapılandırılmadı · Yeniden Yetkilendirme Gerekli · Hata
 */
export const GET = apiRoute(async (_request, { session }) => {
  const rows = await prisma.providerIntegration.findMany({ where: { workspaceId: session.user.workspaceId } });
  const map = new Map(rows.map((r) => [r.platform, r]));

  const accountCounts = await prisma.socialAccount.groupBy({
    by: ['platform'],
    where: { workspaceId: session.user.workspaceId },
    _count: { _all: true }
  });
  const countMap = new Map(accountCounts.map((a) => [a.platform, a._count._all]));

  const items = await Promise.all(
    PLATFORMS.map(async (platform) => {
      const meta = PLATFORM_META[platform];
      const row = map.get(platform);
      const creds = await resolveProviderCredentials(session.user.workspaceId, platform);
      const configured = Boolean(creds);
      let status = row?.status ?? (configured ? 'NEEDS_REAUTH' : 'NOT_CONFIGURED');
      if (!configured) status = 'NOT_CONFIGURED';

      return {
        platform,
        name: meta.name,
        shortName: meta.shortName,
        brandColor: meta.brandColor,
        officialApi: meta.officialApi,
        docsUrl: meta.docsUrl,
        contentTypes: meta.contentTypes,
        status,
        statusLabel: INTEGRATION_STATUS_LABELS[status as keyof typeof INTEGRATION_STATUS_LABELS] ?? status,
        credentialsSet: configured,
        credentialsFromWorkspace: Boolean(creds?.fromWorkspace),
        clientIdMasked: creds
          ? creds.id.length > 6
            ? `${creds.id.slice(0, 3)}••••••${creds.id.slice(-3)}`
            : '••••••'
          : null,
        envKeys: [`${meta.envKeyPrefix}APP_ID`, `${meta.envKeyPrefix}CLIENT_ID`, `${meta.envKeyPrefix}APP_SECRET`, `${meta.envKeyPrefix}CLIENT_SECRET`],
        apiVersion: row?.apiVersion ?? null,
        message: row?.message ?? null,
        lastCheckedAt: row?.lastCheckedAt ?? null,
        connectedAccounts: countMap.get(platform) ?? 0
      };
    })
  );

  return ok({ items, globalDemoMode: env.demoMode, aiMode: env.ai.provider });
});
