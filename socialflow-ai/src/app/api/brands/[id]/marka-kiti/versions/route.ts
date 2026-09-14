import { apiRoute, ok, notFound } from '@/lib/api';
import { createBrandKitVersion, listBrandKitVersions } from '@/lib/brandkit/service';
import { assertBrandKit } from '@/lib/brandkit/permissions';
import { audit } from '@/lib/security/audit';

/** Sürüm geçmişi (§45-§46). GET: liste (yeni→eski). POST: yeni anlık görüntü. */

export const GET = apiRoute(async (_request, { session, params }) => {
  const versions = await listBrandKitVersions({
    workspaceId: session.user.workspaceId,
    brandId: params.id
  });
  return ok(versions);
});

export const POST = apiRoute(
  async (request, { session, params }) => {
    assertBrandKit(session, 'edit');
    const body = await request.json().catch(() => ({}));
    const result = await createBrandKitVersion({
      workspaceId: session.user.workspaceId,
      brandId: params.id,
      note: body.note ? String(body.note).slice(0, 500) : undefined,
      label: body.label ? String(body.label).slice(0, 40) : undefined,
      createdBy: session.user.id
    });
    if (!result) return notFound('Marka kiti bulunamadı.');
    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'brandkit.version.create',
      entityType: 'BrandKit',
      entityId: params.id,
      metadata: { brandId: params.id, version: result.version },
      request
    });
    return ok(result);
  },
  { limit: 30 }
);
