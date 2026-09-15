import { apiRoute, ok, fail } from '@/lib/api';
import { assertRole } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';
import {
  listAdminProviderIntegrations,
  updateAdminProviderIntegration
} from '@/lib/social/providerConfigService';

export const dynamic = 'force-dynamic';

/**
 * Platform Entegrasyon Yapılandırması (Sistem/Admin Seviyesi).
 * Yalnızca OWNER ve ADMIN rolündeki kullanıcılar erişebilir.
 */
export const GET = apiRoute(
  async (_request, { session }) => {
    assertRole(session, 'ADMIN');
    const items = await listAdminProviderIntegrations();
    return ok({ items });
  },
  { limit: 30 }
);

export const POST = apiRoute(
  async (request, { session }) => {
    assertRole(session, 'ADMIN');
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || !body.provider || !body.clientId) {
      return fail('INVALID_INPUT', 'Sağlayıcı kodu (provider) ve İstemci Kimliği (clientId) zorunludur.', 400);
    }

    const updated = await updateAdminProviderIntegration({
      provider: String(body.provider),
      environment: body.environment,
      clientId: String(body.clientId),
      clientSecret: body.clientSecret ? String(body.clientSecret) : undefined,
      developerToken: body.developerToken ? String(body.developerToken) : undefined,
      apiVersion: body.apiVersion ? String(body.apiVersion) : undefined,
      authorizationUrl: body.authorizationUrl ? String(body.authorizationUrl) : undefined,
      tokenUrl: body.tokenUrl ? String(body.tokenUrl) : undefined,
      redirectUri: body.redirectUri ? String(body.redirectUri) : undefined,
      webhookUrl: body.webhookUrl ? String(body.webhookUrl) : undefined,
      webhookSecret: body.webhookSecret ? String(body.webhookSecret) : undefined,
      requestedScopes: Array.isArray(body.requestedScopes) ? body.requestedScopes : undefined,
      approvedScopes: Array.isArray(body.approvedScopes) ? body.approvedScopes : undefined,
      appReviewStatus: body.appReviewStatus,
      writeEnabled: body.writeEnabled,
      readEnabled: body.readEnabled,
      analyticsEnabled: body.analyticsEnabled,
      adsEnabled: body.adsEnabled
    });

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'admin.integration.configured',
      entityType: 'ProviderIntegrationConfig',
      entityId: updated.id,
      metadata: {
        provider: updated.provider,
        environment: updated.environment,
        appReviewStatus: updated.appReviewStatus
      },
      request
    });

    return ok({
      success: true,
      provider: updated.provider,
      environment: updated.environment,
      status: updated.status,
      appReviewStatus: updated.appReviewStatus
    });
  },
  { limit: 20, sessionCsrf: true }
);
