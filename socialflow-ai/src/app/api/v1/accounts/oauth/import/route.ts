import { apiRoute, ok, fail } from '@/lib/api';
import { assertRole } from '@/lib/auth/session';
import { importSelectedAsset } from '@/lib/social/assetDiscoveryService';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(
  async (request, { session }) => {
    assertRole(session, 'EDITOR');
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object' || !body.sessionKey || !body.assetId) {
      return fail('INVALID_INPUT', 'Oturum anahtarı (sessionKey) ve Varlık Kimliği (assetId) zorunludur.', 400);
    }

    try {
      const result = await importSelectedAsset({
        sessionKey: String(body.sessionKey),
        assetId: String(body.assetId),
        brandId: body.brandId ? String(body.brandId) : null,
        displayName: body.displayName ? String(body.displayName) : undefined,
        userContext: session
      });

      return ok(result);
    } catch (err: any) {
      return fail('IMPORT_FAILED', err?.message || 'Hesap içe aktarılamadı.', 400);
    }
  },
  { limit: 20, sessionCsrf: true }
);
