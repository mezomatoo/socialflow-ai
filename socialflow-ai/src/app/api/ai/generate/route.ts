import { apiRoute, ok, badRequest } from '@/lib/api';
import prisma from '@/lib/prisma';
import { generate, TASK_LABELS, type AssistantTask } from '@/lib/ai/captionGenerationService';

const VALID_TASKS = Object.keys(TASK_LABELS) as AssistantTask[];

/**
 * AI İçerik Asistanı — metin üretimi (Faz 2 §30).
 * LLM anahtarı yoksa deterministik yerel üreticiye düşer; motor bilgisi
 * ('LLM' | 'LOCAL') yanıtta dürüstçe bildirilir.
 */
export const POST = apiRoute(
  async (request, { session }) => {
    const body = await request.json().catch(() => ({}));
    const task = String(body.task ?? '') as AssistantTask;
    if (!VALID_TASKS.includes(task)) return badRequest('Geçersiz görev türü.');

    let brandName: string | null = null;
    if (body.brandId) {
      const brand = await prisma.brand.findFirst({
        where: { id: String(body.brandId), workspaceId: session.user.workspaceId },
        select: { name: true, defaultStyle: true }
      });
      brandName = brand?.name ?? null;
    }

    const result = await generate({
      task,
      topic: body.topic ? String(body.topic) : undefined,
      text: body.text ? String(body.text) : undefined,
      brandName,
      style: body.style ? String(body.style) : undefined,
      platform: body.platform ? String(body.platform) : undefined,
      productName: body.productName ? String(body.productName) : undefined,
      price: body.price ? String(body.price) : undefined,
      discount: body.discount ? String(body.discount) : undefined,
      startDate: body.startDate ? String(body.startDate) : undefined,
      endDate: body.endDate ? String(body.endDate) : undefined,
      location: body.location ? String(body.location) : undefined
    });
    return ok(result);
  },
  { limit: 20, windowMs: 60_000 }
);
