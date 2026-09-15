import { AccountRegistrationError, registerAccount } from '@/lib/services/accountRegistrationService';
import { apiRoute, ok, fail } from '@/lib/api';
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

/** Local target only; real connection is confirmed by OAuth, never by client input. */
export const POST = apiRoute(async (request, { session }) => {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('INVALID_INPUT', 'Geçersiz istek.', 400);
    return ok(await registerAccount(session, body), { status: 201 });
  } catch (error) {
    if (error instanceof AccountRegistrationError) return fail('ACCOUNT_REGISTRATION', error.message, error.status);
    if (error instanceof SyntaxError) return fail('INVALID_INPUT', 'Geçersiz JSON gövdesi.', 400);
    return fail('ACCOUNT_REGISTRATION', 'Hesap eklenemedi. Lütfen tekrar deneyin.', 500);
  }
}, { limit: 30, sessionCsrf: true });
