import { apiRoute, ok, badRequest } from '@/lib/api';
import prisma from '@/lib/prisma';
import { CONNECTION_STATUS_LABELS } from '@/lib/platforms/platforms';

/** Bağlı sosyal medya hesapları. Token'lar ASLA dönmez. */
export const GET = apiRoute(async (_request, { session }) => {
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId: session.user.workspaceId },
    include: {
      brand: { select: { id: true, name: true, primaryColor: true } },
      token: { select: { expiresAt: true, refreshExpiresAt: true, lastRefreshedAt: true, scope: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  return ok({
    items: accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      handle: a.handle,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      accountType: a.accountType,
      connectionStatus: a.connectionStatus,
      connectionStatusLabel: CONNECTION_STATUS_LABELS[a.connectionStatus as keyof typeof CONNECTION_STATUS_LABELS] ?? a.connectionStatus,
      demoAccount: a.demoAccount,
      lastError: a.lastError,
      lastValidatedAt: a.lastValidatedAt,
      brandId: a.brandId,
      brandName: a.brand?.name ?? null,
      scopes: a.scopes.split(',').filter(Boolean),
      tokenExpiresAt: a.token?.expiresAt ?? null,
      externalId: a.externalId
    }))
  });
});

/** Demo hesabı ekle / hesap bilgilerini güncelle. */
export const POST = apiRoute(
  async (request, { session }) => {
    const body = await request.json().catch(() => ({}));
    if (!body.platform || !body.handle) return badRequest('Platform ve kullanıcı adı zorunludur.');

    const existing = await prisma.socialAccount.findFirst({
      where: { workspaceId: session.user.workspaceId, platform: String(body.platform), handle: String(body.handle) }
    });
    if (existing) return badRequest('Bu hesap zaten bağlı.');

    const account = await prisma.socialAccount.create({
      data: {
        workspaceId: session.user.workspaceId,
        brandId: body.brandId ? String(body.brandId) : null,
        platform: String(body.platform),
        handle: String(body.handle),
        displayName: body.displayName ? String(body.displayName) : String(body.handle),
        avatarUrl: body.avatarUrl ? String(body.avatarUrl) : null,
        accountType: body.accountType ? String(body.accountType) : 'PROFILE',
        connectionStatus: 'ACTIVE',
        demoAccount: body.demoAccount !== false,
        scopes: Array.isArray(body.scopes) ? body.scopes.join(',') : '',
        externalId: body.externalId ? String(body.externalId) : null
      }
    });
    return ok({ id: account.id });
  },
  { limit: 30 }
);
