import { apiRoute, ok, fail } from '@/lib/api';
import { assertRole } from '@/lib/auth/session';
import { getDiscoveredAssetsSummary } from '@/lib/social/assetDiscoveryService';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(
  async (request, { session }) => {
    assertRole(session, 'EDITOR');
    const { searchParams } = new URL(request.url);
    const sessionKey = searchParams.get('session');

    if (!sessionKey) {
      return fail('INVALID_INPUT', 'Oturum anahtarı (session) belirtilmedi.', 400);
    }

    const summary = await getDiscoveredAssetsSummary(sessionKey, session.user.workspaceId);
    if (!summary) {
      return fail('SESSION_EXPIRED', 'Bağlantı oturumu bulunamadı veya süresi doldu. Lütfen tekrar deneyin.', 404);
    }

    return ok(summary);
  },
  { limit: 30 }
);
