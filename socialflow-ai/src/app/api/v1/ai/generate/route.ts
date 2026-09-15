import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok, badRequest } from '@/lib/api';
import { generate, TASK_LABELS, type AssistantTask } from '@/lib/ai/captionGenerationService';
import prisma from '@/lib/prisma';
import { aiModeLabel } from '@/lib/ai/llmClient';

/** AI İçerik Asistanı */
export const POST = apiRoute(
  async (request, { session }) => {
  assertModuleEnabled('aiAssistant');
    const body = await request.json().catch(() => ({}));
    const task = String(body.task ?? '') as AssistantTask;
    if (!TASK_LABELS[task]) {
      return badRequest(
        `Geçersiz AI görevi. Desteklenen görevler: ${Object.keys(TASK_LABELS).join(', ')}`
      );
    }

    const brand = body.brandId
      ? await prisma.brand.findFirst({
          where: { id: String(body.brandId), workspaceId: session.user.workspaceId },
          include: { voice: true }
        })
      : null;

    const out = await generate({
      task,
      topic: body.topic ? String(body.topic) : undefined,
      text: body.text ? String(body.text) : undefined,
      brandName: brand?.name ?? null,
      productName: body.productName ? String(body.productName) : undefined,
      price: body.price ? String(body.price) : undefined,
      discount: body.discount ? String(body.discount) : undefined,
      startDate: body.startDate ? String(body.startDate) : undefined,
      endDate: body.endDate ? String(body.endDate) : undefined,
      location: body.location ? String(body.location) : undefined,
      website: body.website ?? brand?.website ?? undefined,
      targetLength: body.targetLength ? Number(body.targetLength) : undefined,
      style: body.style ?? brand?.defaultStyle ?? 'PROFESSIONAL',
      platform: body.platform ? String(body.platform) : undefined,
      contentType: body.contentType ? String(body.contentType) : undefined,
      brandVoice: brand?.voice
        ? {
            tone: brand.voice.tone,
            personality: brand.voice.personality,
            audience: brand.voice.audience ?? brand.targetAudience,
            allowedTerms: brand.voice.allowedTerms.split(',').map((s) => s.trim()).filter(Boolean),
            bannedTerms: brand.voice.bannedTerms.split(',').map((s) => s.trim()).filter(Boolean),
            mustKeepTerms: brand.voice.mustKeepTerms.split(',').map((s) => s.trim()).filter(Boolean),
            formality: brand.voice.formality,
            emojiLevel: brand.voice.emojiLevel,
            language: 'tr'
          }
        : null
    });

    return ok({ ...out, aiMode: aiModeLabel(), taskLabel: TASK_LABELS[task] });
  },
  { limit: 60 }
);
