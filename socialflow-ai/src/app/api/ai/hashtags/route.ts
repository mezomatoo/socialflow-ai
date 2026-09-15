import { apiRoute, ok, badRequest } from '@/lib/api';
import prisma from '@/lib/prisma';
import { generateHashtags } from '@/lib/ai/hashtagService';

/** AI İçerik Asistanı — hashtag önerisi (çalışma alanı veritabanından trend + marka + konum). */
export const POST = apiRoute(
  async (request, { session }) => {
    const body = await request.json().catch(() => ({}));
    const text = String(body.text ?? '').trim();
    if (!text) return badRequest('Hashtag önerisi için metin gerekli.');

    let brandName: string | null = null;
    if (body.brandId) {
      const brand = await prisma.brand.findFirst({
        where: { id: String(body.brandId), workspaceId: session.user.workspaceId },
        select: { name: true }
      });
      brandName = brand?.name ?? null;
    }

    const result = await generateHashtags({
      text,
      brandName,
      location: body.location ? String(body.location) : null,
      maxHashtags: 30,
      recommendedHashtags: 12,
      workspaceId: session.user.workspaceId
    });
    return ok({ selected: result.selected, groups: result.groups, block: result.block, note: result.note });
  },
  { limit: 30, windowMs: 60_000 }
);
