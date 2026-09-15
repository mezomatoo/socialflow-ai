/**
 * Sistem sağlığı toplayıcısı (Faz 7 §114-§115)
 * ---------------------------------------------------------------------------
 * Yönetici operasyon görünümü için GERÇEK veriler toplar; sahte yeşil durum
 * üretilmez. Tüm sayaçlar çalışma alanına ÖZGÜDÜR (§122 izolasyon).
 */
import prisma from '../prisma';
import { env } from '../env';

export interface JobCounters {
  queued: number;
  running: number;
  done24h: number;
  failed24h: number;
}

export interface FailedJobRow {
  id: string;
  type: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  updatedAt: string;
}

export interface PublicationCounters {
  published: number;
  failed: number;
  simulated: number;
}

export interface IntegrationRowInfo {
  platform: string;
  status: string;
  credentialsSet: boolean;
  message: string | null;
}

export interface SystemHealthSnapshot {
  databaseReachable: boolean;
  appEnv: string;
  /** Simülasyon modu (yalnız geliştirmede zorlanabilir; üretimde hep false). */
  simulationMode: boolean;
  aiMode: string;
  jobs: JobCounters;
  recentFailedJobs: FailedJobRow[];
  publications: PublicationCounters;
  integrations: IntegrationRowInfo[];
  gatheredAt: string;
}

async function checkDatabase(): Promise<boolean> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('zaman aşımı')), 2_000))
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function gatherSystemHealth(workspaceId: string): Promise<SystemHealthSnapshot> {
  const databaseReachable = await checkDatabase();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  if (!databaseReachable) {
    // DB erişilemezse dürüst kısmi durum döner — sayılar uydurulmaz (§115).
    return {
      databaseReachable: false,
      appEnv: env.appEnv,
      simulationMode: env.demoMode,
      aiMode: 'bilinmiyor (veritabanı erişilemez)',
      jobs: { queued: 0, running: 0, done24h: 0, failed24h: 0 },
      recentFailedJobs: [],
      publications: { published: 0, failed: 0, simulated: 0 },
      integrations: [],
      gatheredAt: new Date().toISOString()
    };
  }

  const [queued, running, done24h, failed24h, recentFailed, pubRows, integrations] = await Promise.all([
    prisma.job.count({ where: { workspaceId, status: 'QUEUED' } }),
    prisma.job.count({ where: { workspaceId, status: 'RUNNING' } }),
    prisma.job.count({ where: { workspaceId, status: 'DONE', updatedAt: { gte: since24h } } }),
    prisma.job.count({ where: { workspaceId, status: 'FAILED', updatedAt: { gte: since24h } } }),
    prisma.job.findMany({
      where: { workspaceId, status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: { id: true, type: true, attempts: true, maxAttempts: true, lastError: true, updatedAt: true }
    }),
    prisma.publication.findMany({
      where: { createdAt: { gte: since24h }, platformContent: { is: { content: { is: { workspaceId } } } } },
      select: { status: true, demoMode: true }
    }),
    prisma.providerIntegration.findMany({
      where: { workspaceId },
      orderBy: { platform: 'asc' },
      select: { platform: true, status: true, credentialsSet: true, message: true }
    })
  ]);

  const publications: PublicationCounters = { published: 0, failed: 0, simulated: 0 };
  for (const row of pubRows) {
    if (row.status === 'PUBLISHED') {
      publications.published += 1;
      if (row.demoMode) publications.simulated += 1;
    } else if (row.status === 'FAILED') {
      publications.failed += 1;
    }
  }

  return {
    databaseReachable: true,
    appEnv: env.appEnv,
    simulationMode: env.demoMode,
    aiMode: env.ai.provider,
    jobs: { queued, running, done24h, failed24h },
    recentFailedJobs: recentFailed.map((j) => ({
      id: j.id,
      type: j.type,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      lastError: j.lastError,
      updatedAt: j.updatedAt.toISOString()
    })),
    publications,
    integrations: integrations.map((i) => ({
      platform: i.platform,
      status: i.status,
      credentialsSet: i.credentialsSet,
      message: i.message
    })),
    gatheredAt: new Date().toISOString()
  };
}
