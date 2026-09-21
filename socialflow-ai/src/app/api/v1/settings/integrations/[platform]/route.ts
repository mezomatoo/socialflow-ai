import { apiRoute, ok, badRequest, notFound } from '@/lib/api';
import prisma from '@/lib/prisma';
import { assertRole } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';
import { toCipherText } from '@/lib/crypto';
import { PLATFORMS, PLATFORM_META, type PlatformCode } from '@/lib/platforms/platforms';
import { invalidateProviderCredentials, resolveProviderCredentials } from '@/lib/social/workspaceCredentials';

/**
 * Platform API kimlik bilgileri (BYOK).
 * PUT    → client id + secret kaydet (secret AES-256-GCM ile şifrelenir)
 * DELETE → kayıtlı kimliği sil (ortam değişkeni varsa o geçerli kalır)
 */
export const PUT = apiRoute(
  async (request, { session, params }) => {
    assertRole(session, 'ADMIN');
    const platform = String(params.platform ?? '').toUpperCase() as PlatformCode;
    if (!PLATFORMS.includes(platform)) return notFound('Bilinmeyen platform.');

    const body = await request.json().catch(() => ({}));
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';

    if (!clientId || !clientSecret) {
      return badRequest('Kimlik numarası ve secret alanlarının ikisi de zorunludur.');
    }
    if (clientId.length < 3 || clientSecret.length < 8) {
      return badRequest('Kimlik bilgileri çok kısa görünüyor; kontrol edip tekrar deneyin.');
    }

    await prisma.providerCredential.upsert({
      where: { workspaceId_platform: { workspaceId: session.user.workspaceId, platform } },
      create: {
        workspaceId: session.user.workspaceId,
        platform,
        clientId,
        clientSecretEnc: toCipherText(clientSecret)
      },
      update: { clientId, clientSecretEnc: toCipherText(clientSecret) }
    });
    invalidateProviderCredentials(session.user.workspaceId, platform);

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'integration.credentials.set',
      entityType: 'ProviderCredential',
      entityId: platform,
      metadata: { platform },
      request
    });

    return ok({ platform, name: PLATFORM_META[platform]?.name ?? platform, credentialsSet: true });
  },
  { limit: 30 }
);

export const DELETE = apiRoute(
  async (_request, { session, params }) => {
    assertRole(session, 'ADMIN');
    const platform = String(params.platform ?? '').toUpperCase() as PlatformCode;
    if (!PLATFORMS.includes(platform)) return notFound('Bilinmeyen platform.');

    await prisma.providerCredential.deleteMany({
      where: { workspaceId: session.user.workspaceId, platform }
    });
    invalidateProviderCredentials(session.user.workspaceId, platform);

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'integration.credentials.clear',
      entityType: 'ProviderCredential',
      entityId: platform,
      metadata: { platform },
      request: _request
    });

    // Ortam değişkeninde kimlik varsa hâlâ yapılandırılmış sayılır.
    const remaining = await resolveProviderCredentials(session.user.workspaceId, platform);
    return ok({ platform, credentialsSet: Boolean(remaining), fromWorkspace: Boolean(remaining?.fromWorkspace) });
  },
  { limit: 30 }
);
