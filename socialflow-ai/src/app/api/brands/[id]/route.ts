import { apiRoute, ok, badRequest, notFound } from '@/lib/api';
import prisma from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

export const GET = apiRoute(async (_request, { session, params }) => {
  const brand = await prisma.brand.findFirst({
    where: { id: params.id, workspaceId: session.user.workspaceId },
    include: { voice: true, socialAccounts: true, _count: { select: { contents: true } } }
  });
  if (!brand) return notFound('Marka profili bulunamadı.');
  return ok(brand);
});

export const PATCH = apiRoute(
  async (request, { session, params }) => {
    const brand = await prisma.brand.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!brand) return notFound('Marka profili bulunamadı.');

    const body = await request.json().catch(() => ({}));
    const data: any = {};
    for (const key of [
      'name', 'logoUrl', 'primaryColor', 'secondaryColor', 'fontStyle', 'website', 'defaultCta',
      'description', 'targetAudience', 'defaultStyle', 'defaultHashtags', 'requiredHashtags',
      'bannedHashtags', 'defaultMentions'
    ]) {
      if (body[key] !== undefined) data[key] = body[key] === null ? null : String(body[key]);
    }
    if (body.isDefault === true) {
      await prisma.brand.updateMany({ where: { workspaceId: session.user.workspaceId }, data: { isDefault: false } });
      data.isDefault = true;
    }

    const updated = await prisma.brand.update({ where: { id: params.id }, data });

    if (body.voice) {
      await prisma.brandVoice.upsert({
        where: { brandId: params.id },
        create: {
          brandId: params.id,
          tone: body.voice.tone ?? 'profesyonel ve samimi',
          personality: body.voice.personality ?? null,
          audience: body.voice.audience ?? null,
          allowedTerms: (body.voice.allowedTerms ?? []).join(', '),
          bannedTerms: (body.voice.bannedTerms ?? []).join(', '),
          mustKeepTerms: (body.voice.mustKeepTerms ?? []).join(', '),
          formality: body.voice.formality ?? 'NEUTRAL',
          emojiLevel: body.voice.emojiLevel ?? 'MEDIUM'
        },
        update: {
          tone: body.voice.tone,
          personality: body.voice.personality,
          audience: body.voice.audience,
          allowedTerms: (body.voice.allowedTerms ?? []).join(', '),
          bannedTerms: (body.voice.bannedTerms ?? []).join(', '),
          mustKeepTerms: (body.voice.mustKeepTerms ?? []).join(', '),
          formality: body.voice.formality,
          emojiLevel: body.voice.emojiLevel
        }
      });
    }

    await audit({ workspaceId: session.user.workspaceId, userId: session.user.id, action: 'brand.update', entityType: 'Brand', entityId: params.id, request });
    return ok(await prisma.brand.findUnique({ where: { id: params.id }, include: { voice: true } }));
  },
  { limit: 60 }
);

export const DELETE = apiRoute(
  async (_request, { session, params }) => {
    const brand = await prisma.brand.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!brand) return notFound('Marka profili bulunamadı.');
    const inUse = await prisma.content.count({ where: { brandId: params.id } });
    if (inUse > 0) return badRequest(`Bu markaya ait ${inUse} içerik var. Marka silinemez.`);
    const inboxCount = await prisma.socialConversation.count({ where: { workspaceId: session.user.workspaceId, brandId: params.id } });
    if (inboxCount) return badRequest('Bu markanın konuşma geçmişi var. Veri saklama politikası uygulanmadan marka silinemez.');
    await prisma.brand.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  },
  { limit: 20 }
);
