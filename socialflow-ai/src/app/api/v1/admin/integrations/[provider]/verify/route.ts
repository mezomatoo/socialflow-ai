import { apiRoute, ok, fail } from '@/lib/api';
import { assertRole } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';
import { verifyProviderIntegration } from '@/lib/social/providerConfigService';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(
  async (request, { session, params }) => {
    assertRole(session, 'ADMIN');
    const provider = params.provider;
    if (!provider) return fail('INVALID_INPUT', 'Sağlayıcı belirtilmedi.', 400);

    const result = await verifyProviderIntegration(provider);

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'admin.integration.verified',
      metadata: {
        provider,
        status: result.status,
        ok: result.ok
      },
      request
    });

    return ok(result);
  },
  { limit: 20, sessionCsrf: true }
);
