import prisma from '../prisma';
import { env } from '../env';
import { adaptCaption } from '../ai/captionAdaptationService';
import { getRule, getAllRules } from '../rules/ruleEngine';
import { notify } from './notifications';
import { audit } from '../security/audit';
import { recordGeneration } from '../ai/generationLog';
import { activeProviderName, getAiAdapter } from '../ai/provider';
import { logger } from '../observability';
import { charLength } from '../text';
import { contentKey, PLATFORM_META, type ContentType, type PlatformCode } from '../platforms/platforms';
import type { MediaVariant } from '../media/types';

/**
 * ContentService — master Content + PlatformContent çocuk kayıtları.
 * ---------------------------------------------------------------------------
 * Tek bir Content nesnesi kullanıcının master içeriğini temsil eder.
 * Her sosyal ağ için YENİ BİR KAMPANYA KOPYALANMAZ; platform bazlı çocuk
 * PlatformContent kayıtları türetilir ve her biri bağımsız metin, medya
 * varyantı, durum ve zamanlama taşır.
 */

export interface SelectionItem {
  platform: PlatformCode;
  contentType: ContentType;
  accountId?: string | null;
}

export interface CreateContentInput {
  workspaceId: string;
  brandId: string;
  userId?: string | null;
  campaignId?: string | null;
  title?: string | null;
  masterCaption: string;
  storyText?: string | null;
  linkUrl?: string | null;
  utm?: Record<string, string> | null;
  defaultStyle?: string;
  defaultCta?: string | null;
  hashtagPlacement?: 'INLINE' | 'FIRST_COMMENT' | 'SEPARATE';
  mediaIds?: string[];
  selections?: SelectionItem[];
  timezone?: string;
}

export async function createContent(input: CreateContentInput) {
  const brand = await prisma.brand.findFirst({ where: { id: input.brandId, workspaceId: input.workspaceId } });
  if (!brand) throw new Error('Marka profili bulunamadı.');

  const content = await prisma.content.create({
    data: {
      workspaceId: input.workspaceId,
      brandId: input.brandId,
      campaignId: input.campaignId ?? null,
      title: input.title ?? null,
      masterCaption: input.masterCaption ?? '',
      storyText: input.storyText ?? null,
      linkUrl: input.linkUrl ?? null,
      utm: input.utm ? JSON.stringify(input.utm) : null,
      defaultStyle: input.defaultStyle ?? brand.defaultStyle,
      defaultCta: input.defaultCta ?? brand.defaultCta ?? null,
      hashtagPlacement: input.hashtagPlacement ?? 'INLINE',
      timezone: input.timezone ?? 'Europe/Istanbul',
      createdById: input.userId ?? null,
      status: 'DRAFT',
      media: {
        create: (input.mediaIds ?? []).map((id, i) => ({ mediaId: id, position: i }))
      },
      versions: {
        create: {
          version: 1,
          kind: 'ORIGINAL',
          note: 'Orijinal ana açıklama',
          payload: JSON.stringify({ masterCaption: input.masterCaption ?? '', storyText: input.storyText ?? null }),
          createdById: input.userId ?? null
        }
      }
    }
  });

  if (input.selections?.length) await syncSelections(content.id, input.workspaceId, input.selections);
  return content;
}

/**
 * Seçimleri PlatformContent çocuk kayıtlarıyla eşitler.
 * Yeni seçimler eklenir, kaldırılanlar silinir (yayınlanmışlar korunur).
 */
export async function syncSelections(contentId: string, workspaceId: string, selections: SelectionItem[]) {
  const existing = await prisma.platformContent.findMany({ where: { contentId } });
  const existingMap = new Map(existing.map((e) => [e.key, e]));
  const wantedKeys = new Set<string>();

  for (const sel of selections) {
    const key = contentKey(sel.platform, sel.contentType);
    wantedKeys.add(key);
    const rule = await getRule(workspaceId, sel.platform, sel.contentType);
    const found = existingMap.get(key);

    if (found) {
      await prisma.platformContent.update({
        where: { id: found.id },
        data: {
          enabled: true,
          socialAccountId: sel.accountId ?? found.socialAccountId,
          charLimit: rule?.maxCaptionLength ?? found.charLimit,
          aspectRatio: rule?.recommendedAspectRatio ?? found.aspectRatio
        }
      });
    } else {
      await prisma.platformContent.create({
        data: {
          contentId,
          key,
          platform: sel.platform,
          contentType: sel.contentType,
          socialAccountId: sel.accountId ?? null,
          charLimit: rule?.maxCaptionLength ?? 2200,
          aspectRatio: rule?.recommendedAspectRatio ?? null,
          status: 'DRAFT',
          captionSource: 'PENDING',
          hashtagPlacement: 'INLINE'
        }
      });
    }
  }

  // Seçimden çıkarılanlar (yayınlanmış olanlar korunur)
  for (const e of existing) {
    if (!wantedKeys.has(e.key) && !['PUBLISHED', 'PUBLISHING'].includes(e.status)) {
      await prisma.platformContent.delete({ where: { id: e.id } });
    } else if (!wantedKeys.has(e.key)) {
      await prisma.platformContent.update({ where: { id: e.id }, data: { enabled: false } });
    }
  }
}

export interface AdaptContentInput {
  contentId: string;
  workspaceId: string;
  userId?: string | null;
  /** Yalnızca bu hedefleri yeniden oluştur (boşsa hepsi). */
  targetIds?: string[];
  /** Kullanıcının elle düzenlediği metinleri koru. */
  preserveManual?: boolean;
}

/**
 * "AI ile Platformlara Uyarla" — her hedef için bağımsız optimize metin üretir.
 * Metin asla karakter sınırından kesilmez.
 */
export async function adaptContentToPlatforms(input: AdaptContentInput) {
  const content = await prisma.content.findUnique({
    where: { id: input.contentId },
    include: {
      brand: { include: { voice: true } },
      campaign: true,
      media: { include: { media: true } },
      platformContents: true
    }
  });
  if (!content) throw new Error('İçerik bulunamadı.');

  const targets = content.platformContents.filter(
    (t) => t.enabled && (!input.targetIds?.length || input.targetIds.includes(t.id))
  );

  const results: {
    platformContentId: string;
    platform: string;
    contentType: string;
    label: string;
    ok: boolean;
    caption: string;
    charactersUsed: number;
    limit: number;
    shortened: boolean;
    truncated: boolean;
    warnings: string[];
    modifications: unknown[];
    engine: string;
    skipped?: boolean;
  }[] = [];

  /** AI sağlayıcısı en az bir kez başarısız oldu mu? (arayüz kullanıcıyı uyarır) */
  let aiFailed = false;
  let aiErrorCode: string | null = null;

  const rules = await getAllRules(input.workspaceId);

  for (const t of targets) {
    const rule = rules.find((r) => r.platform === t.platform && r.contentType === t.contentType) ?? null;

    if (input.preserveManual && t.captionSource === 'MANUAL') {
      results.push({
        platformContentId: t.id,
        platform: t.platform,
        contentType: t.contentType,
        label: rule?.label ?? t.platform,
        ok: true,
        caption: t.caption,
        charactersUsed: charLength(t.caption),
        limit: rule?.maxCaptionLength ?? t.charLimit,
        shortened: false,
        truncated: false,
        warnings: [],
        modifications: [],
        engine: 'MANUAL',
        skipped: true
      });
      continue;
    }

    if (!rule) {
      results.push({
        platformContentId: t.id,
        platform: t.platform,
        contentType: t.contentType,
        label: t.platform,
        ok: false,
        caption: t.caption,
        charactersUsed: charLength(t.caption),
        limit: t.charLimit,
        shortened: false,
        truncated: false,
        warnings: [`${PLATFORM_META[t.platform as PlatformCode]?.name ?? t.platform} için platform kuralı bulunamadı.`],
        modifications: [],
        engine: 'NONE'
      });
      continue;
    }

    const startedAt = Date.now();
    const providerName = activeProviderName();
    const out = await adaptCaption({
      masterCaption: content.masterCaption,
      platform: t.platform,
      contentType: t.contentType,
      maximumLength: rule.maxCaptionLength,
      preferredLength: rule.recommendedCaptionLength,
      rule,
      style: content.defaultStyle,
      brandName: content.brand.name,
      campaignName: content.campaign?.name ?? null,
      linkUrl: content.linkUrl,
      defaultCta: content.defaultCta,
      hashtagPlacement: (content.hashtagPlacement as any) ?? 'INLINE',
      storyText: content.storyText,
      requiredHashtags: content.brand.requiredHashtags.split(/[\s,]+/).filter(Boolean),
      prohibitedTerms: [
        ...content.brand.bannedHashtags.split(/[\s,]+/).filter(Boolean).map((h) => `#${h}`),
        ...(content.brand.voice?.bannedTerms ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      ],
      brandVoice: content.brand.voice
        ? {
            tone: content.brand.voice.tone,
            personality: content.brand.voice.personality,
            audience: content.brand.voice.audience ?? content.brand.targetAudience,
            allowedTerms: content.brand.voice.allowedTerms.split(',').map((s) => s.trim()).filter(Boolean),
            bannedTerms: content.brand.voice.bannedTerms.split(',').map((s) => s.trim()).filter(Boolean),
            mustKeepTerms: content.brand.voice.mustKeepTerms.split(',').map((s) => s.trim()).filter(Boolean),
            formality: content.brand.voice.formality,
            emojiLevel: content.brand.voice.emojiLevel,
            language: 'tr'
          }
        : null
    });

    // Yapay zekâ üretimi kaydı (§39) — gizli bilgi saklanmaz, yalnızca özet.
    await recordGeneration({
      workspaceId: input.workspaceId,
      contentId: content.id,
      brandId: content.brandId,
      userId: input.userId ?? null,
      type: 'ADAPT_CAPTION',
      provider: providerName,
      model: providerName === 'openai' ? env.ai.openaiModel : providerName === 'anthropic' ? env.ai.anthropicModel : null,
      platform: t.platform,
      contentType: t.contentType,
      prompt: `${content.masterCaption}\n---\n${rule.platform}:${rule.contentType}`,
      status: out.engine === 'LLM' ? 'SUCCESS' : 'SKIPPED',
      errorCode: out.engine === 'LLM' ? null : 'LOCAL_ENGINE',
      durationMs: Date.now() - startedAt,
      metadata: {
        engine: out.engine,
        shortened: out.shortened,
        truncated: out.truncated,
        warnings: out.warnings.length,
        ruleVersion: rule.version,
        missingTerms: out.missingTerms
      }
    });

    await prisma.platformContent.update({
      where: { id: t.id },
      data: {
        caption: out.caption,
        captionSource: out.engine === 'LLM' || out.engine === 'LOCAL' ? 'AI' : t.captionSource,
        hashtags: out.hashtags.join(' '),
        hashtagPlacement: content.hashtagPlacement,
        firstComment: out.firstComment,
        cta: out.callToAction,
        linkUrl: content.linkUrl,
        charLimit: out.limit,
        charUsed: out.charactersUsed,
        aspectRatio: rule.recommendedAspectRatio,
        targetWidth: null,
        targetHeight: null,
        safeAreaOk: true,
        lastError: out.warnings[0] ?? null,
        // Üretimde kullanılan kural sürümü saklanır (§11).
        platformRuleVersion: rule.version,
        updatedAt: new Date()
      }
    });

    results.push({
      platformContentId: t.id,
      platform: t.platform,
      contentType: t.contentType,
      label: rule.label,
      ok: true,
      caption: out.caption,
      charactersUsed: out.charactersUsed,
      limit: out.limit,
      shortened: out.shortened,
      truncated: out.truncated,
      warnings: out.warnings,
      modifications: out.modifications,
      engine: out.engine
    });
  }

  // Sürüm geçmişi
  const nextVersion = content.version + 1;
  await prisma.content.update({
    where: { id: content.id },
    data: { version: nextVersion, adaptState: 'ADAPTED' }
  });
  await prisma.contentVersion.create({
    data: {
      contentId: content.id,
      version: nextVersion,
      kind: 'AI_ADAPTED',
      note: `AI platform uyarlaması (${results.length} hedef)`,
      payload: JSON.stringify({
        masterCaption: content.masterCaption,
        storyText: content.storyText,
        results: results.map((r) => ({ platform: r.platform, contentType: r.contentType, caption: r.caption }))
      }),
      createdById: input.userId ?? null
    }
  });

  await audit({
    workspaceId: input.workspaceId,
    userId: input.userId ?? null,
    action: 'content.adapt',
    entityType: 'Content',
    entityId: content.id,
    metadata: { targets: results.length, version: nextVersion }
  });

  // AI sağlayıcısı yapılandırılmış ama başarısız olduysa kullanıcı bilgilendirilir
  // ve metinler elle düzenlemeye AÇIK kalır (§69).
  if (aiFailed) {
    logger.warn({
      event: 'ai.adapt_degraded',
      workspaceId: input.workspaceId,
      contentId: content.id,
      code: aiErrorCode,
      targets: results.length
    });
  }

  const aiNotice = aiFailed
    ? 'AI servisine şu anda ulaşılamıyor. Metinler yerel motorla uyarlandı; dilediğiniz platformu elle düzenleyebilirsiniz.'
    : null;

  return { version: nextVersion, results, aiNotice, aiProvider: activeProviderName() };
}

/** Kullanıcı bir platform metnini elle düzenlediğinde. */
export async function updatePlatformCaption(params: {
  platformContentId: string;
  workspaceId: string;
  caption: string;
  hashtags?: string;
  cta?: string | null;
  firstComment?: string | null;
  userId?: string | null;
}) {
  const pc = await prisma.platformContent.findUnique({
    where: { id: params.platformContentId },
    include: { content: true }
  });
  if (!pc || pc.content.workspaceId !== params.workspaceId) throw new Error('İçerik bulunamadı.');

  const limit = pc.charLimit || 2200;
  const used = charLength(params.caption);
  if (used > limit) {
    throw new Error(`Açıklama ${used} karakter; bu platformun sınırı ${limit} karakter. Lütfen metni kısaltın.`);
  }

  const updated = await prisma.platformContent.update({
    where: { id: params.platformContentId },
    data: {
      caption: params.caption,
      captionSource: 'MANUAL',
      charUsed: used,
      hashtags: params.hashtags ?? pc.hashtags,
      cta: params.cta !== undefined ? params.cta : pc.cta,
      firstComment: params.firstComment !== undefined ? params.firstComment : pc.firstComment,
      updatedAt: new Date()
    }
  });

  return updated;
}

/** "Orijinal Metne Dön" */
export async function restoreOriginalCaption(platformContentId: string, workspaceId: string) {
  const pc = await prisma.platformContent.findUnique({
    where: { id: platformContentId },
    include: { content: true }
  });
  if (!pc || pc.content.workspaceId !== workspaceId) throw new Error('İçerik bulunamadı.');

  const rule = await getRule(workspaceId, pc.platform, pc.contentType);
  const limit = rule?.maxCaptionLength ?? pc.charLimit;
  let caption = pc.content.masterCaption;
  if (charLength(caption) > limit) {
    const out = await adaptCaption({
      masterCaption: pc.content.masterCaption,
      platform: pc.platform,
      contentType: pc.contentType,
      maximumLength: limit,
      rule,
      hashtagPlacement: 'SEPARATE'
    });
    caption = out.caption;
  }

  return prisma.platformContent.update({
    where: { id: platformContentId },
    data: { caption, captionSource: 'ORIGINAL', charUsed: charLength(caption), updatedAt: new Date() }
  });
}

/** Master açıklama güncellendiğinde sürüm kaydı oluşturur. */
export async function updateMasterCaption(params: {
  contentId: string;
  workspaceId: string;
  masterCaption: string;
  storyText?: string | null;
  title?: string | null;
  linkUrl?: string | null;
  defaultStyle?: string;
  userId?: string | null;
}) {
  const content = await prisma.content.findUnique({ where: { id: params.contentId } });
  if (!content || content.workspaceId !== params.workspaceId) throw new Error('İçerik bulunamadı.');

  const nextVersion = content.version + 1;
  const updated = await prisma.content.update({
    where: { id: params.contentId },
    data: {
      masterCaption: params.masterCaption,
      storyText: params.storyText !== undefined ? params.storyText : content.storyText,
      title: params.title !== undefined ? params.title : content.title,
      linkUrl: params.linkUrl !== undefined ? params.linkUrl : content.linkUrl,
      defaultStyle: params.defaultStyle ?? content.defaultStyle,
      version: nextVersion,
      adaptState: 'NONE'
    }
  });

  await prisma.contentVersion.create({
    data: {
      contentId: params.contentId,
      version: nextVersion,
      kind: 'MANUAL',
      note: 'Ana açıklama kullanıcı tarafından güncellendi',
      payload: JSON.stringify({ masterCaption: params.masterCaption, storyText: updated.storyText }),
      createdById: params.userId ?? null
    }
  });

  return updated;
}

export async function listVersions(contentId: string) {
  return prisma.contentVersion.findMany({ where: { contentId }, orderBy: { version: 'desc' } });
}

/** Sürüme geri dön. */
export async function restoreVersion(contentId: string, version: number, workspaceId: string) {
  const v = await prisma.contentVersion.findFirst({ where: { contentId, version } });
  if (!v) throw new Error('Sürüm bulunamadı.');
  const payload = JSON.parse(v.payload || '{}');
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content || content.workspaceId !== workspaceId) throw new Error('İçerik bulunamadı.');

  const nextVersion = content.version + 1;
  await prisma.content.update({
    where: { id: contentId },
    data: {
      masterCaption: payload.masterCaption ?? content.masterCaption,
      storyText: payload.storyText ?? content.storyText,
      version: nextVersion
    }
  });
  await prisma.contentVersion.create({
    data: {
      contentId,
      version: nextVersion,
      kind: 'RESTORED',
      note: `${version}. sürüme geri dönüldü`,
      payload: JSON.stringify(payload)
    }
  });
  return { version: nextVersion };
}

/** UI için zengin içerik DTO'su. */
export async function getContentDetail(contentId: string, workspaceId: string) {
  const content = await prisma.content.findUnique({
    where: { id: contentId },
    include: {
      brand: { include: { voice: true } },
      campaign: true,
      media: { include: { media: true } },
      versions: { orderBy: { version: 'desc' }, take: 20 },
      platformContents: {
        include: { socialAccount: true, mediaAsset: true },
        orderBy: { createdAt: 'asc' }
      },
      schedules: true,
      createdBy: { select: { id: true, name: true } }
    }
  });
  if (!content || content.workspaceId !== workspaceId) return null;

  const rules = await getAllRules(workspaceId);
  return {
    ...content,
    platformContents: content.platformContents.map((pc) => ({
      ...pc,
      rule: rules.find((r) => r.platform === pc.platform && r.contentType === pc.contentType) ?? null,
      variants: pc.mediaAsset ? parseVariants(pc.mediaAsset.derivatives) : []
    }))
  };
}

export function parseVariants(raw: string | null): MediaVariant[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as MediaVariant[]) : [];
  } catch {
    return [];
  }
}

export async function deleteContent(contentId: string, workspaceId: string) {
  const content = await prisma.content.findFirst({ where: { id: contentId, workspaceId } });
  if (!content) throw new Error('İçerik bulunamadı.');
  await prisma.content.delete({ where: { id: contentId } });
  return { deleted: true };
}

export { notify };
