import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getPhase1Stats, phase1Onboarding } from '@/lib/services/dashboardService';
import { getDailyAssistant } from '@/lib/ai/dailyAssistant';
import { getDashboardStats } from '@/lib/services/analyticsService';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import prisma from '@/lib/prisma';
import { DashboardView } from './DashboardView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ana Sayfa' };

/**
 * Ana Sayfa (§24)
 * ---------------------------------------------------------------------------
 * Faz 1'de yayın/analitik modülleri kapalıdır; ana sayfa ÜRETİM akışını
 * gösterir (taslaklar, hazır içerikler, medya, markalar, platform dağılımı).
 * Yayın metrikleri yalnızca ilgili modül açıkken hesaplanır ve gösterilir —
 * aksi halde çalışmayan bir modülün sayıları kullanıcıya sunulmaz.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/giris');

  const workspaceId = session.user.workspaceId;
  const publishingEnabled = isModuleEnabled('socialPublishing');

  const stats = await getPhase1Stats(workspaceId);

  const [brands, accounts, legacyStats, recentFailures, assistant] = await Promise.all([
    prisma.brand.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      take: 6,
      select: { id: true, name: true, primaryColor: true, logoUrl: true, isDefault: true }
    }),
    prisma.socialAccount.findMany({
      where: { workspaceId },
      select: { id: true, platform: true, handle: true, displayName: true, connectionStatus: true, demoAccount: true }
    }),
    publishingEnabled
      ? getDashboardStats(workspaceId, { timezone: session.user.timezone, demoMode: session.user.demoMode })
      : Promise.resolve(null),
    publishingEnabled
      ? prisma.platformContent.findMany({
          where: { content: { workspaceId }, status: 'FAILED' },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: { id: true, contentId: true, platform: true, contentType: true, lastError: true, updatedAt: true }
        })
      : Promise.resolve([]),
    getDailyAssistant(workspaceId)
  ]);

  const onboarding = phase1Onboarding({
    brands: stats.brands,
    mediaAssets: stats.mediaAssets,
    contentsTotal: stats.contentsTotal,
    adaptedTargets: stats.adaptedTargets
  });

  return (
    <DashboardView
      stats={JSON.parse(JSON.stringify(stats))}
      publishingStats={legacyStats ? JSON.parse(JSON.stringify(legacyStats)) : null}
      onboarding={onboarding}
      brands={JSON.parse(JSON.stringify(brands))}
      accounts={JSON.parse(JSON.stringify(accounts))}
      recentFailures={JSON.parse(JSON.stringify(recentFailures))}
      user={{ name: session.user.name, workspaceName: session.user.workspaceName, timezone: session.user.timezone }}
      demoMode={session.user.demoMode}
      assistant={JSON.parse(JSON.stringify(assistant))}
    />
  );
}
