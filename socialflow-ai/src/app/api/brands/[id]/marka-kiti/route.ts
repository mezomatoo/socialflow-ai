import { apiRoute, ok, notFound } from '@/lib/api';
import { ensureBrandKit, updateBrandKit } from '@/lib/brandkit/service';
import { computeCompleteness } from '@/lib/brandkit/completeness';
import { brandKitPermissionsFor, assertBrandKit } from '@/lib/brandkit/permissions';
import { featureFlagState } from '@/lib/brandkit/featureFlags';
import { audit } from '@/lib/security/audit';

/**
 * PHASE 4 — Brand Kit ana uç
 * GET  : kiti tembel olarak oluşturur (ensure+backfill), tam aggregate + doluluk
 *        + rol yetkileri + özellik bayraklarını döner.
 * PATCH: genel bilgiler / iletişim / kilit / tutarlılık kapısı / AI-öğrenme.
 *        Kilit ile ilgili alanlar 'lock', diğerleri 'edit' yetkisi gerektirir.
 */

export const GET = apiRoute(async (_request, { session, params }) => {
  const kit = await ensureBrandKit({ workspaceId: session.user.workspaceId, brandId: params.id });
  if (!kit) return notFound('Marka bulunamadı.');
  return ok({
    kit,
    completeness: computeCompleteness(kit),
    permissions: brandKitPermissionsFor(session.user.role),
    flags: featureFlagState()
  });
});

const LOCK_LEVEL_KEYS = ['lockMode', 'strictMode', 'consistencyGate', 'learnFromApproved'];

export const PATCH = apiRoute(
  async (request, { session, params }) => {
    const body = await request.json().catch(() => ({}));
    const touchesLock = LOCK_LEVEL_KEYS.some((k) => k in body);
    if (touchesLock) assertBrandKit(session, 'lock');
    else assertBrandKit(session, 'edit');

    const updated = await updateBrandKit(
      { workspaceId: session.user.workspaceId, brandId: params.id },
      body
    );
    if (!updated) return notFound('Marka kiti bulunamadı.');

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'brandkit.update',
      entityType: 'BrandKit',
      entityId: updated.id,
      metadata: { brandId: params.id, fields: Object.keys(body) },
      request
    });
    return ok({ kit: updated, completeness: computeCompleteness(updated) });
  },
  { limit: 60 }
);
