import { apiRoute, ok, badRequest } from '@/lib/api';
import prisma from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

/**
 * PHASE 4 — AI Geri Bildirimi (§58)
 * POST: kullanıcı bir AI çıktısını değerlendirir.
 *  - rating: LIKED | DISLIKED | REGENERATED | HEAVILY_EDITED (zorunlu)
 *  - service: hangi AI servisi (captionGeneration, imageGeneration, ...)
 *  - outputId/contentId/brandId: opsiyonel referans; workspace doğrulaması
 *    outputId bir AiGeneration kaydıysa yapıılır (başka workspace'e yazılamaz).
 */

const RATINGS = ['LIKED', 'DISLIKED', 'REGENERATED', 'HEAVILY_EDITED'] as const;

export const POST = apiRoute(
  async (request, { session }) => {
    const body = await request.json().catch(() => ({}));
    const rating = String(body.rating ?? '');
    if (!RATINGS.includes(rating as (typeof RATINGS)[number])) {
      return badRequest('Geçersiz geri bildirim türü.');
    }
    const service = String(body.service ?? '').trim();
    if (!service) return badRequest('AI servisi belirtilmelidir.');
    const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : null;

    const workspaceId = session.user.workspaceId;
    const outputId = typeof body.outputId === 'string' && body.outputId ? body.outputId : null;

    // outputId verildiyse kaydın BU çalışma alanına ait olduğu doğrulanır (§97).
    if (outputId) {
      const generation = await prisma.aiGeneration.findFirst({
        where: { id: outputId, workspaceId }
      });
      if (!generation) return badRequest('Geribildirim verilecek AI çıktısı bulunamadı.');
    }

    const feedback = await prisma.aiFeedback.create({
      data: {
        workspaceId,
        userId: session.user.id,
        brandId: typeof body.brandId === 'string' && body.brandId ? body.brandId : null,
        contentId: typeof body.contentId === 'string' && body.contentId ? body.contentId : null,
        service,
        outputId,
        rating,
        note
      }
    });

    await audit({
      workspaceId,
      userId: session.user.id,
      action: 'ai.feedback.created',
      entityType: 'AiFeedback',
      entityId: feedback.id,
      metadata: { service, rating, outputId }
    });

    return ok({ id: feedback.id });
  },
  { limit: 60 }
);
