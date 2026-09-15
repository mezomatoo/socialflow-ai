import { assertModuleEnabled } from '@/lib/phase/phaseGates';
import { apiRoute, ok } from '@/lib/api';
import { generateHashtags } from '@/lib/ai/hashtagService';
import { getRule } from '@/lib/rules/ruleEngine';
import prisma from '@/lib/prisma';

/** AI Hashtag Önerileri */
export const POST = apiRoute(
  async (request, { session }) => {
    assertModuleEnabled('aiAssistant');
    const body = await request.json().catch(() => ({}));
    const platform = body.platform ? String(body.platform) : null;
    const contentType = body.contentType ? String(body.contentType) : null;
    const rule = platform && contentType ? await getRule(session.user.workspaceId, platform, contentType) : null;

    const brand = body.brandId
      ? await prisma.brand.findFirst({ where: { id: String(body.brandId), workspaceId: session.user.workspaceId } })
      : null;

    const out = await generateHashtags({
      text: String(body.text ?? ''),
      brandName: brand?.name ?? body.brandName ?? null,
      defaultHashtags: (brand?.defaultHashtags ?? '').split(/[\s,]+/).filter(Boolean),
      requiredHashtags: (brand?.requiredHashtags ?? '').split(/[\s,]+/).filter(Boolean),
      bannedHashtags: (brand?.bannedHashtags ?? '').split(/[\s,]+/).filter(Boolean),
      campaignName: body.campaignName ?? null,
      location: body.location ?? null,
      workspaceId: session.user.workspaceId,
      maxHashtags: rule?.maxHashtags ?? Number(body.maxHashtags ?? 10),
      recommendedHashtags: rule?.recommendedHashtags ?? Number(body.recommendedHashtags ?? 4),
      contentType: contentType ?? undefined
    });

    return ok(out);
  },
  { limit: 60 }
);
