import prisma from '../prisma';
import type { SessionContext } from '../auth/session';
import { isFeatureEnabled } from '../brandkit/featureFlags';
import { AdvertisingError, AD_CAPABILITIES, unavailableMetric } from './contracts';
import { advertisingRegistry } from './registry';
import { canAdvertising, rejectFinancialWrite, type AdPermission } from './permissions';

export async function authorizeAdvertising(session: SessionContext, permission: AdPermission = 'ads:view') {
  if (!isFeatureEnabled('paidMedia')) throw new AdvertisingError('FEATURE_DISABLED', 'Reklam modülü bu kurulumda kapalı.', 404);
  const user = await prisma.user.findFirst({ where: { id: session.user.id, workspaceId: session.user.workspaceId, isActive: true } });
  if (!user || !canAdvertising(user.role, permission)) throw new AdvertisingError('FORBIDDEN', 'Bu reklam işlemi için yetkiniz yok.', 403);
  return user;
}
const selection = {
  id: true, provider: true, providerAccountId: true, displayName: true, currency: true,
  timezone: true, providerTimezone: true, connectionStatus: true, version: true,
  brandId: true, lastValidatedAt: true, lastAccountSyncAt: true, lastCampaignSyncAt: true,
  lastMetricsSyncAt: true, lastConversionSyncAt: true, lastCatalogSyncAt: true,
  brand: { select: { id: true, name: true } },
  // Select only expiry metadata: encrypted credentials must not enter the read DTO pipeline.
  credential: { select: { expiresAt: true } },
  capabilitySnapshots: { orderBy: { version: 'desc' as const }, take: 1,
    select: { version: true, apiVersion: true, source: true, verifiedAt: true, capabilities: true } }
} as const;
function toView(account: Awaited<ReturnType<typeof loadRows>>[number]) {
  const { credential, capabilitySnapshots, ...record } = account;
  const adapter = advertisingRegistry.get(account.provider);
  const latest = capabilitySnapshots[0];
  let status = record.connectionStatus;
  if (status === 'CONNECTED' && (!credential || !record.lastValidatedAt || (credential.expiresAt && credential.expiresAt <= new Date()))) status = 'REAUTH_REQUIRED';
  let evidence: Record<string, unknown> = {};
  if (status === 'CONNECTED' && latest?.source === 'PROVIDER' && latest.verifiedAt) {
    try { const parsed = JSON.parse(latest.capabilities); if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') evidence = parsed; } catch { /* invalid capability data must fail closed */ }
  }
  const capabilities = Object.fromEntries(AD_CAPABILITIES.map(key => [key, adapter.getCapabilities()[key] && Object.hasOwn(evidence, key) && evidence[key] === true]));
  const iso = (value: Date | null) => value?.toISOString() ?? null;
  return {
    ...record, connectionStatus: status, providerName: adapter.info.name,
    lastValidatedAt: iso(record.lastValidatedAt), lastAccountSyncAt: iso(record.lastAccountSyncAt),
    lastCampaignSyncAt: iso(record.lastCampaignSyncAt), lastMetricsSyncAt: iso(record.lastMetricsSyncAt),
    lastConversionSyncAt: iso(record.lastConversionSyncAt), lastCatalogSyncAt: iso(record.lastCatalogSyncAt),
    tokenExpiresAt: iso(credential?.expiresAt ?? null), capabilities,
    capabilityVersion: latest?.version ?? null, capabilityApiVersion: latest?.apiVersion ?? null,
    health: {
      oauth: status === 'CONNECTED' ? 'VERIFIED' : 'NOT_VERIFIED',
      campaigns: record.lastCampaignSyncAt ? 'SYNCED_BEFORE' : 'NOT_SYNCED',
      analytics: record.lastMetricsSyncAt ? 'SYNCED_BEFORE' : 'NOT_SYNCED',
      conversions: record.lastConversionSyncAt ? 'SYNCED_BEFORE' : 'NOT_SYNCED',
      catalog: record.lastCatalogSyncAt ? 'SYNCED_BEFORE' : 'NOT_SYNCED',
      webhooks: 'NOT_CONFIGURED'
    }
  };
}
async function loadRows(workspaceId: string, filter: { provider?: string; brandId?: string; page: number }) {
  return prisma.adAccount.findMany({ where: { workspaceId, ...(filter.provider ? { provider: filter.provider } : {}), ...(filter.brandId ? { brandId: filter.brandId } : {}) },
    select: selection, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], skip: (filter.page - 1) * 30, take: 30 });
}
export async function listAdAccounts(session: SessionContext, params = new URLSearchParams()) {
  await authorizeAdvertising(session);
  const provider = params.get('provider') || undefined;
  if (provider) advertisingRegistry.get(provider);
  const brandId = params.get('brand') || undefined;
  const rawPage = params.get('page') || '1';
  if (!/^\d+$/.test(rawPage) || Number(rawPage) < 1 || Number(rawPage) > 10000) throw new AdvertisingError('INVALID_INPUT', 'Geçersiz sayfa.');
  const page = Number(rawPage), workspaceId = session.user.workspaceId;
  const [rows, total] = await Promise.all([
    loadRows(workspaceId, { provider, brandId, page }),
    prisma.adAccount.count({ where: { workspaceId, ...(provider ? { provider } : {}), ...(brandId ? { brandId } : {}) } })
  ]);
  return { items: rows.map(toView), total, page };
}
export async function getAdAccount(session: SessionContext, id: string) {
  await authorizeAdvertising(session);
  const record = await prisma.adAccount.findFirst({ where: { id, workspaceId: session.user.workspaceId }, select: selection });
  if (!record) throw new AdvertisingError('NOT_FOUND', 'Kayıt bulunamadı.', 404);
  return toView(record);
}
export async function advertisingOverview(session: SessionContext) {
  const user = await authorizeAdvertising(session);
  const [totalAccounts, brands, workspace] = await Promise.all([
    prisma.adAccount.count({ where: { workspaceId: user.workspaceId } }),
    prisma.brand.findMany({ where: { workspaceId: user.workspaceId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId }, select: { timezone: true } })
  ]);
  return {
    totalAccounts, brands, workspaceTimezone: workspace.timezone, canManageAccounts: canAdvertising(user.role, 'ads:accounts_manage'),
    providers: advertisingRegistry.list().map(adapter => ({ ...adapter.info, capabilities: adapter.getCapabilities() })),
    // No ad metrics store/ingestion in Stage A foundation. Never use account counts as spend or ROAS.
    metrics: { spend: unavailableMetric(), activeCampaigns: unavailableMetric(), impressions: unavailableMetric(), clicks: unavailableMetric(), conversions: unavailableMetric(), revenue: unavailableMetric(), roas: unavailableMetric(), cpa: unavailableMetric() },
    financialWritesEnabled: false
  };
}
/** Local brand mapping only — no call to the ad network and no change to spend. */
export async function mapAdAccountBrand(session: SessionContext, id: string, input: Record<string, unknown>) {
  await authorizeAdvertising(session, 'ads:accounts_manage');
  if (Object.keys(input).some(key => !['brandId', 'version'].includes(key)) || !Number.isSafeInteger(input.version) || (input.brandId !== null && (typeof input.brandId !== 'string' || !input.brandId || input.brandId.length > 100))) {
    throw new AdvertisingError('INVALID_INPUT', 'Marka ve kayıt sürümü geçerli olmalıdır.');
  }
  const workspaceId = session.user.workspaceId;
  return prisma.$transaction(async tx => {
    const record = await tx.adAccount.findFirst({ where: { id, workspaceId } });
    if (!record) throw new AdvertisingError('NOT_FOUND', 'Kayıt bulunamadı.', 404);
    if (record.version !== input.version) throw new AdvertisingError('CONFLICT', 'Hesap değişti. Listeyi yenileyip tekrar deneyin.', 409);
    if (input.brandId && !await tx.brand.findFirst({ where: { id: input.brandId as string, workspaceId } })) throw new AdvertisingError('NOT_FOUND', 'Kayıt bulunamadı.', 404);
    const changed = await tx.adAccount.updateMany({ where: { id, workspaceId, version: record.version }, data: { brandId: input.brandId as string | null, version: { increment: 1 } } });
    if (changed.count !== 1) throw new AdvertisingError('CONFLICT', 'Hesap değişti. Listeyi yenileyin.', 409);
    await tx.auditLog.create({ data: { workspaceId, userId: session.user.id, action: 'ads.account.brand_mapped', entityType: 'AdAccount', entityId: id, metadata: JSON.stringify({ oldBrandId: record.brandId, newBrandId: input.brandId }) } });
    return { id, version: record.version + 1 };
  });
}
export async function requestAdvertisingConnection(session: SessionContext, provider: string): Promise<never> {
  await authorizeAdvertising(session, 'ads:accounts_manage');
  advertisingRegistry.get(provider);
  if (session.sessionId === 'preview-demo') throw new AdvertisingError('PREVIEW_ONLY', 'Demo önizleme oturumu gerçek reklam hesabına bağlanamaz.', 403);
  throw new AdvertisingError('API_LIMITATION', 'API KISITLAMASI — Resmî reklam OAuth bağlantısı bu aşamada henüz etkin değil. Organik hesap bağlantısı reklam izni sayılmaz.', 422);
}
export async function requestFinancialOperation(session: SessionContext): Promise<never> {
  await authorizeAdvertising(session, 'ads:view');
  // No payload parsing, provider call or queued job can occur past this unconditional Stage A gate.
  return rejectFinancialWrite();
}
export type AdAccountView = Awaited<ReturnType<typeof getAdAccount>>;
export type AdvertisingOverview = Awaited<ReturnType<typeof advertisingOverview>>;
