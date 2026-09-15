import { apiRoute, ok, fail } from '@/lib/api';
import { assertRole } from '@/lib/auth/session';
import { fetchExistingOrganicPosts } from '@/lib/advertising/adEligibilityService';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(
  async (request, { session }) => {
    assertRole(session, 'EDITOR');
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return fail('INVALID_INPUT', 'Sosyal medya hesap kimliği (accountId) zorunludur.', 400);
    }

    const posts = await fetchExistingOrganicPosts(accountId, {
      workspaceId: session.user.workspaceId,
      limit: 20
    });

    return ok({ items: posts });
  },
  { limit: 30 }
);
