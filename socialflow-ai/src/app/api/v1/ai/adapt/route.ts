import { apiRoute, ok, badRequest } from '@/lib/api';
import { adaptCaption } from '@/lib/ai/captionAdaptationService';
import { getRule, getAllRules } from '@/lib/rules/ruleEngine';
import prisma from '@/lib/prisma';
import { aiModeLabelAsync } from '@/lib/ai/llmClient';

/**
 * Önizleme amaçlı tekil uyarlama (composer'da canlı önizleme için).
 * Kalıcı kayıt oluşturmaz.
 */
export const POST = apiRoute(
  async (request, { session }) => {
    const body = await request.json().catch(() => ({}));
    const masterCaption = String(body.masterCaption ?? '');
    const platform = String(body.platform ?? '');
    const contentType = String(body.contentType ?? '');
    if (!platform || !contentType) return badRequest('Platform ve içerik türü gerekli.');

    const rule = await getRule(session.user.workspaceId, platform, contentType);
    if (!rule) return badRequest('Bu platform/içerik türü için kural bulunamadı.');

    const brand = body.brandId
      ? await prisma.brand.findFirst({
          where: { id: String(body.brandId), workspaceId: session.user.workspaceId },
          include: { voice: true }
        })
      : null;

    const out = await adaptCaption({
      masterCaption,
      platform,
      contentType,
      maximumLength: rule.maxCaptionLength,
      preferredLength: rule.recommendedCaptionLength,
      rule,
      style: body.style ?? brand?.defaultStyle ?? 'PROFESSIONAL',
      brandName: brand?.name ?? null,
      linkUrl: body.linkUrl ?? null,
      defaultCta: body.defaultCta ?? brand?.defaultCta ?? null,
      hashtagPlacement: body.hashtagPlacement ?? 'INLINE',
      storyText: body.storyText ?? null,
      requiredHashtags: (brand?.requiredHashtags ?? '').split(/[\s,]+/).filter(Boolean),
      prohibitedTerms: [
        ...(brand?.bannedHashtags ?? '').split(/[\s,]+/).filter(Boolean).map((h) => `#${h}`),
        ...((brand?.voice?.bannedTerms ?? '').split(',').map((s) => s.trim()).filter(Boolean) as string[])
      ],
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

    return ok({ ...out, aiMode: await aiModeLabelAsync() });
  },
  { limit: 90 }
);
