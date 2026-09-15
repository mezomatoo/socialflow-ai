import prisma from '../prisma';
import { getProvider } from '../social/registry';
import { resolveProviderCredentials } from '../social/workspaceCredentials';
import { getRule } from '../rules/ruleEngine';
import { fromCipherText } from '../crypto';
import { storage } from '../storage/storage';
import { toFriendlyError } from '../social/errors';
import { notify } from '../services/notifications';
import { audit } from '../security/audit';
import type { PublishPayload, PublishResult } from '../social/types';
import type { ContentType, PlatformCode } from '../platforms/platforms';
import { PLATFORM_META } from '../platforms/platforms';
import { charLength } from '../text';
import { validateMediaForRule } from '../media/validate';

/**
 * PublishingService — yayınlama hattının çekirdeği.
 * ---------------------------------------------------------------------------
 * - İdempotent: aynı `PlatformContent` için aynı `idempotencyKey` kullanılır;
 *   retry'lar çift gönderim YARATMAZ.
 * - Hedef bazlı: Instagram başarılı, X başarısız ise kampanya tümden
 *   "başarısız" işaretlenmez; her hedefin kendi durumu güncellenir.
 * - Demo Modu: gerçek paylaşım yapılmaz, sonuç açıkça işaretlenir.
 * - Token'lar yalnızca burada, sunucu tarafında çözülür.
 */

export interface PublishContext {
  workspaceId: string;
  userId?: string | null;
  demoMode: boolean;
}

export interface PublishTargetResult {
  platformContentId: string;
  platform: string;
  contentType: string;
  label: string;
  ok: boolean;
  status: string;
  message: string;
  action?: { label: string; route: string } | null;
  retryable: boolean;
  /** Sağlayıcı Retry-After önerisi (ms) — kuyruk yeniden denemede bunu kullanır. */
  retryAfterMs?: number | null;
  demoMode: boolean;
  permalink?: string | null;
}

/**
 * Tek bir PlatformContent kaydını yayınlar.
 */
export async function publishPlatformContent(
  platformContentId: string,
  ctx: PublishContext
): Promise<PublishTargetResult> {
  const pc = await prisma.platformContent.findUnique({
    where: { id: platformContentId },
    include: {
      content: { include: { brand: true } },
      socialAccount: { include: { token: true } },
      mediaAsset: true
    }
  });

  if (!pc || pc.content.workspaceId !== ctx.workspaceId) {
    return errorResult(platformContentId, 'Hedef bulunamadı.', false);
  }

  const platform = pc.platform as PlatformCode;
  const contentType = pc.contentType as ContentType;
  const label = pc.content.title || `${PLATFORM_META[platform]?.name ?? platform}`;

  // Çalışma alanı Demo Modu'ndan çıkmış olsa bile platform için API kimlik
  // bilgisi tanımlı değilse yayınlama kendiliğinden simülasyona döner
  // (DemoProvider): gerçek OAuth token'ı yoktur ve sahte başarı üretilemez.
  if (!ctx.demoMode) {
    const creds = await resolveProviderCredentials(ctx.workspaceId, platform);
    if (!creds) ctx = { ...ctx, demoMode: true };
  }

  // Onay akışı açıksa
  if (pc.status === 'APPROVAL_PENDING') {
    return errorResult(platformContentId, 'Bu içerik onay bekliyor; onaylanmadan yayınlanamaz.', false, label, platform, contentType);
  }

  const rule = await getRule(ctx.workspaceId, platform, contentType);
  if (!rule) {
    return errorResult(
      platformContentId,
      `${PLATFORM_META[platform]?.name ?? platform} için platform kuralı bulunamadı. Yönetici ayarlarından kuralları yükleyin.`,
      false,
      label,
      platform,
      contentType
    );
  }

  // --- İdempotency ---------------------------------------------------------
  const idempotencyKey = `pc:${platformContentId}:v${pc.content.version}`;
  const existing = await prisma.publication.findUnique({ where: { idempotencyKey } });

  if (existing?.status === 'PUBLISHED') {
    return {
      platformContentId,
      platform,
      contentType,
      label,
      ok: true,
      status: 'PUBLISHED',
      message: existing.demoMode
        ? 'Bu içerik daha önce simülasyon olarak yayınlanmıştı; gerçek paylaşım yapılmadı. Çift gönderim engellendi.'
        : 'Bu içerik daha önce yayınlanmış. Çift gönderim engellendi.',
      retryable: false,
      demoMode: existing.demoMode,
      permalink: existing.permalink
    };
  }

  const publication =
    existing ??
    (await prisma.publication.create({
      data: {
        idempotencyKey,
        platformContentId,
        contentId: pc.contentId,
        socialAccountId: pc.socialAccountId ?? null,
        status: 'PENDING',
        demoMode: ctx.demoMode,
        maxAttempts: 3
      }
    }));

  // --- Yayın öncesi doğrulama ----------------------------------------------
  const preCheck = await runPrePublishChecks(pc, rule, ctx);
  if (!preCheck.ok) {
    await markFailed(publication.id, platformContentId, pc.contentId, preCheck.message, null, ctx);
    return errorResult(platformContentId, preCheck.message, false, label, platform, contentType);
  }

  // --- Durum: yayınlanıyor --------------------------------------------------
  await prisma.platformContent.update({
    where: { id: platformContentId },
    data: { status: 'PUBLISHING', lastError: null, updatedAt: new Date() }
  });
  await prisma.publication.update({
    where: { id: publication.id },
    data: { status: 'IN_PROGRESS', socialAccountId: pc.socialAccountId ?? null, normalizedErrorCode: null }
  });

  // --- Payload hazırla ------------------------------------------------------
  const payload = await buildPayload(pc, rule, ctx, publication.idempotencyKey);

  // --- Değişmez yayın anlık görüntüsü (§40) --------------------------------
  // Sağlayıcı çağrısından ÖNCE yazılır: yayınlanan içerik sonradan
  // düzenlense bile neyin yayınlandığı bu kayıttan kanıtlanır.
  await prisma.publicationSnapshot.upsert({
    where: { publicationId: publication.id },
    create: snapshotData(publication.id, pc, rule, payload),
    update: snapshotData(publication.id, pc, rule, payload)
  });

  // --- Token (yalnızca gerçek modda) ---------------------------------------
  if (!ctx.demoMode) {
    if (!pc.socialAccount?.token) {
      const friendly = 'Hesap bağlantısı bulunamadı. Hesabı yeniden bağlamanız gerekiyor.';
      await markFailed(publication.id, platformContentId, pc.contentId, friendly, null, ctx);
      return {
        platformContentId,
        platform,
        contentType,
        label,
        ok: false,
        status: 'FAILED',
        message: friendly,
        action: { label: 'Hesabı Yeniden Bağla', route: '/app/hesaplar' },
        retryable: false,
        demoMode: false
      };
    }
    try {
      payload.accessToken = fromCipherText(pc.socialAccount.token.accessTokenEnc);
    } catch {
      const friendly = 'Hesap erişim anahtarı çözülemedi. Hesabı yeniden bağlayın.';
      await markFailed(publication.id, platformContentId, pc.contentId, friendly, null, ctx);
      return {
        platformContentId, platform, contentType, label, ok: false, status: 'FAILED',
        message: friendly, action: { label: 'Hesabı Yeniden Bağla', route: '/app/hesaplar' },
        retryable: false, demoMode: false
      };
    }
  }

  // --- Sağlayıcı çağrısı ----------------------------------------------------
  const provider = getProvider(platform);
  const started = Date.now();
  let result: PublishResult;

  try {
    if (contentType === 'STORY') result = await provider.publishStory(payload);
    else if (['REEL', 'SHORTS', 'VIDEO'].includes(contentType)) result = await provider.publishVideo(payload);
    else result = await provider.publishPost(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const friendly = toFriendlyError({ message });
    result = {
      ok: false,
      demoMode: ctx.demoMode,
      providerMessage: message,
      friendlyMessage: friendly.friendlyMessage,
      action: friendly.action ?? null,
      retryable: friendly.retryable
    };
  }

  const durationMs = Date.now() - started;

  // --- Deneme kaydı ---------------------------------------------------------
  const normalizedCode =
    result.normalizedCode ??
    (result.ok ? null : toFriendlyError({ code: result.providerCode, message: result.providerMessage, httpStatus: result.httpStatus }).normalizedCode);

  await prisma.publicationAttempt.create({
    data: {
      publicationId: publication.id,
      attempt: publication.attempts + 1,
      ok: result.ok,
      httpStatus: result.httpStatus ?? null,
      providerCode: result.providerCode ?? null,
      providerMessage: result.providerMessage ? String(result.providerMessage).slice(0, 800) : null,
      friendlyMessage: result.friendlyMessage ?? null,
      normalizedCode: normalizedCode ?? null,
      retryable: result.ok ? null : Boolean(result.retryable),
      actionLabel: result.action?.label ?? null,
      actionRoute: result.action?.route ?? null,
      durationMs
    }
  });

  // --- Faz 2: sağlayıcı platform tarafında işliyor (§51) --------------------
  // Kuyrukta/kabulde PUBLISHED DENİLMEZ (§42); SyncPublicationStatusJob
  // sağlayıcıdan gelen son durumu sonra doğrular.
  if (result.ok && result.processing) {
    await prisma.publication.update({
      where: { id: publication.id },
      data: {
        status: 'PROCESSING',
        providerPostId: result.externalPostId ?? null,
        permalink: result.permalink ?? null,
        attempts: { increment: 1 },
        demoMode: result.demoMode ?? ctx.demoMode,
        lastError: null,
        providerStatusCheckedAt: new Date()
      }
    });
    await prisma.platformContent.update({
      where: { id: platformContentId },
      data: { status: 'PROCESSING', externalPostId: result.externalPostId ?? null, lastError: null, updatedAt: new Date() }
    });
    const { enqueue } = await import('../queue/queue');
    await enqueue({
      type: 'SyncPublicationStatusJob',
      idempotencyKey: `pubsync:${publication.id}:1`,
      runAt: new Date(Date.now() + 120_000),
      workspaceId: ctx.workspaceId,
      maxAttempts: 1,
      payload: { publicationId: publication.id, check: 1 }
    });
    await notify(ctx.workspaceId, {
      type: 'PUBLISHING',
      severity: 'INFO',
      title: `${PLATFORM_META[platform]?.name ?? platform} platformda işleniyor`,
      message: `${rule.label} kabul edildi; platform içeriği işliyor. Sonuç otomatik olarak doğrulanacak.`,
      contentId: pc.contentId,
      userId: ctx.userId ?? null,
      actionLabel: 'Yayınlananlar',
      actionRoute: '/app/icerik/yayinlananlar'
    });
    await rollupContentStatus(pc.contentId);
    return {
      platformContentId,
      platform,
      contentType,
      label: rule.label,
      ok: true,
      status: 'PROCESSING',
      message: result.friendlyMessage ?? 'İçerik kabul edildi; platform tarafından işleniyor.',
      retryable: false,
      demoMode: Boolean(result.demoMode ?? ctx.demoMode),
      permalink: result.permalink ?? null
    };
  }

  if (result.ok) {
    await prisma.publication.update({
      where: { id: publication.id },
      data: {
        status: 'PUBLISHED',
        providerPostId: result.externalPostId ?? null,
        permalink: result.permalink ?? null,
        publishedAt: new Date(),
        attempts: { increment: 1 },
        demoMode: result.demoMode ?? ctx.demoMode,
        lastError: null
      }
    });
    await prisma.platformContent.update({
      where: { id: platformContentId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        externalPostId: result.externalPostId ?? null,
        permalink: result.permalink ?? null,
        lastError: null,
        lastErrorCode: null,
        retryCount: { increment: 1 },
        updatedAt: new Date()
      }
    });

    await notify(ctx.workspaceId, {
      type: 'PUBLISHED',
      severity: 'SUCCESS',
      title: `${PLATFORM_META[platform]?.name ?? platform} yayını başarılı`,
      message:
        result.demoMode || ctx.demoMode
          ? `Simülasyon — ${rule.label} için API kimlik bilgisi tanımlı olmadığından gerçek sosyal medya paylaşımı yapılmadı.`
          : `${rule.label} başarıyla yayınlandı.`,
      contentId: pc.contentId,
      actionLabel: result.permalink ? 'Gönderiyi Görüntüle' : 'İçeriği Aç',
      actionRoute: result.permalink ?? `/yayinlananlar?content=${pc.contentId}`
    });

    await audit({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId ?? null,
      action: 'publication.success',
      entityType: 'PlatformContent',
      entityId: platformContentId,
      metadata: { platform, contentType, demoMode: result.demoMode ?? ctx.demoMode }
    });

    await rollupContentStatus(pc.contentId);

    return {
      platformContentId,
      platform,
      contentType,
      label: rule.label,
      ok: true,
      status: 'PUBLISHED',
      message:
        result.demoMode || ctx.demoMode
          ? 'Simülasyon — API kimlik bilgisi tanımlı olmadığından gerçek sosyal medya paylaşımı yapılmadı.'
          : `${rule.label} yayınlandı.`,
      retryable: false,
      demoMode: Boolean(result.demoMode || ctx.demoMode),
      permalink: result.permalink ?? null
    };
  }

  // --- Başarısız ------------------------------------------------------------
  const friendlyMessage =
    result.friendlyMessage ?? 'Yayınlama sırasında beklenmeyen bir sorun oluştu. Lütfen tekrar deneyin.';

  await prisma.publication.update({
    where: { id: publication.id },
    data: {
      status: 'FAILED',
      attempts: { increment: 1 },
      lastError: friendlyMessage.slice(0, 500),
      normalizedErrorCode: normalizedCode ?? null
    }
  });

  await prisma.platformContent.update({
    where: { id: platformContentId },
    data: {
      status: 'FAILED',
      lastError: friendlyMessage,
      lastErrorCode: result.providerCode ?? null,
      retryCount: { increment: 1 },
      updatedAt: new Date()
    }
  });

  await notify(ctx.workspaceId, {
    type: 'PUBLISH_FAILED',
    severity: 'ERROR',
    title: `${PLATFORM_META[platform]?.name ?? platform} yayını başarısız`,
    message: friendlyMessage,
    contentId: pc.contentId,
    actionLabel: result.action?.label ?? 'Tekrar Dene',
    actionRoute: result.action?.route || `/planlananlar?content=${pc.contentId}`
  });

  await audit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId ?? null,
    action: 'publication.failed',
    entityType: 'PlatformContent',
    entityId: platformContentId,
    metadata: { platform, contentType, code: result.providerCode, httpStatus: result.httpStatus }
  });

  await rollupContentStatus(pc.contentId);

  return {
    platformContentId,
    platform,
    contentType,
    label: rule.label,
    ok: false,
    status: 'FAILED',
    message: friendlyMessage,
    action: result.action ?? null,
    retryable: Boolean(result.retryable),
    retryAfterMs: result.retryAfterMs ?? null,
    demoMode: ctx.demoMode
  };
}

/** Tüm hedefleri sırayla yayınlar (kısmi başarıyı korur). */
export async function publishContent(contentId: string, ctx: PublishContext): Promise<{
  results: PublishTargetResult[];
  ready: number;
  total: number;
  contentStatus: string;
}> {
  const targets = await prisma.platformContent.findMany({
    where: { contentId, enabled: true },
    select: { id: true }
  });

  const results: PublishTargetResult[] = [];
  for (const t of targets) {
    results.push(await publishPlatformContent(t.id, ctx));
  }

  const content = await prisma.content.findUnique({ where: { id: contentId }, select: { status: true } });
  return {
    results,
    ready: results.filter((r) => r.ok).length,
    total: results.length,
    contentStatus: content?.status ?? 'DRAFT'
  };
}

/** Başarısız hedefi yeniden dener. */
export async function retryPlatformContent(platformContentId: string, ctx: PublishContext) {
  // İdempotency anahtarı sürüme bağlı olduğundan yeni deneme kaydı oluşur.
  return publishPlatformContent(platformContentId, ctx);
}

// ---------------------------------------------------------------------------
// İç yardımcılar
// ---------------------------------------------------------------------------

function errorResult(
  platformContentId: string,
  message: string,
  retryable: boolean,
  label = 'İçerik',
  platform = 'UNKNOWN',
  contentType = 'POST'
): PublishTargetResult {
  return {
    platformContentId,
    platform,
    contentType,
    label,
    ok: false,
    status: 'FAILED',
    message,
    retryable,
    demoMode: true
  };
}

async function markFailed(
  publicationId: string,
  platformContentId: string,
  contentId: string,
  message: string,
  code: string | null,
  ctx: PublishContext
) {
  await prisma.publication.update({ where: { id: publicationId }, data: { status: 'FAILED', lastError: message.slice(0, 500) } });
  await prisma.platformContent.update({
    where: { id: platformContentId },
    data: { status: 'FAILED', lastError: message, lastErrorCode: code, updatedAt: new Date() }
  });
  await rollupContentStatus(contentId);
  await notify(ctx.workspaceId, {
    type: 'PUBLISH_FAILED',
    severity: 'ERROR',
    title: 'Yayın kontrolü başarısız',
    message,
    contentId
  });
}

/** Yayın öncesi kontrol — kural motoruna karşı doğrulama. */
export async function runPrePublishChecks(pc: any, rule: any, ctx: PublishContext): Promise<{ ok: boolean; message: string }> {
  // 1) Hesap bağlantısı
  if (!ctx.demoMode && (!pc.socialAccount || pc.socialAccount.connectionStatus !== 'ACTIVE')) {
    return {
      ok: false,
      message: `${rule.label} için hesap bağlantısı aktif değil. Hesabı yeniden bağlamanız gerekiyor.`
    };
  }
  if (!pc.socialAccount) {
    return { ok: false, message: `${rule.label} için bir sosyal medya hesabı seçilmedi.` };
  }

  // 2) Açıklama sınırı
  const length = charLength(pc.caption ?? '');
  if (length > rule.maxCaptionLength) {
    return {
      ok: false,
      message: `Açıklama ${length} karakter; ${rule.label} sınırı ${rule.maxCaptionLength} karakter. AI ile yeniden uyarlayın.`
    };
  }

  // 3) Medya
  const media = pc.mediaAsset;
  if (media) {
    const issues = validateMediaForRule(
      {
        kind: media.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE',
        mimeType: media.mimeType,
        format: media.format,
        bytes: media.bytes,
        width: media.width,
        height: media.height,
        durationMs: media.durationMs
      },
      rule
    );
    const blocking = issues.filter((i) => i.level === 'ERROR');
    if (blocking.length) return { ok: false, message: blocking[0].message };
  } else if (['REEL', 'SHORTS', 'VIDEO'].includes(pc.contentType) || rule.contentType === 'PIN') {
    return { ok: false, message: `${rule.label} için medya yüklenmesi gerekiyor.` };
  }

  // 4) Render edilmiş varyant
  const needsRender = pc.contentType !== 'POST' || Boolean(media);
  if (needsRender && media && !pc.renderedKey && !ctx.demoMode) {
    return {
      ok: false,
      message: `${rule.label} için medya varyantı henüz oluşturulmadı. "AI ile Platformlara Uyarla" adımını çalıştırın.`
    };
  }

  return { ok: true, message: 'Yayına hazır' };
}

async function buildPayload(pc: any, rule: any, ctx: PublishContext, idempotencyKey: string): Promise<PublishPayload> {
  const mediaAsset = pc.mediaAsset;
  const media: PublishPayload['media'] = [];

  if (mediaAsset) {
    const key = pc.renderedKey || mediaAsset.storageKey;
    const url = pc.renderedUrl || (await absoluteMediaUrl(key, mediaAsset.publicUrl));
    media.push({
      kind: mediaAsset.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE',
      url,
      storageKey: key,
      mimeType: mediaAsset.mimeType,
      bytes: mediaAsset.bytes,
      width: pc.targetWidth ?? mediaAsset.width,
      height: pc.targetHeight ?? mediaAsset.height,
      durationMs: mediaAsset.durationMs
    });
  }

  return {
    platformContentId: pc.id,
    contentId: pc.contentId,
    workspaceId: ctx.workspaceId,
    platform: pc.platform as PlatformCode,
    contentType: pc.contentType as ContentType,
    rule,
    account: {
      id: pc.socialAccount?.id ?? '',
      externalId: pc.socialAccount?.externalId ?? null,
      handle: pc.socialAccount?.handle ?? '',
      displayName: pc.socialAccount?.displayName ?? '',
      accountType: pc.socialAccount?.accountType ?? 'PROFILE'
    },
    caption: pc.caption ?? '',
    title: null,
    hashtags: String(pc.hashtags ?? '')
      .split(/\s+/)
      .map((t: string) => t.replace(/^#/, ''))
      .filter(Boolean),
    firstComment: pc.firstComment ?? null,
    cta: pc.cta ?? null,
    linkUrl: pc.linkUrl ?? pc.content?.linkUrl ?? null,
    hashtagPlacement: (pc.hashtagPlacement ?? 'INLINE') as any,
    scheduledFor: pc.scheduledFor ?? null,
    media,
    idempotencyKey,
    demoMode: ctx.demoMode
  };
}

/** Yayın anlığına ait değişmez görüntü verisi (§40). */
function snapshotData(publicationId: string, pc: any, rule: any, payload: PublishPayload) {
  const media = payload.media[0];
  return {
    publicationId,
    provider: pc.platform as string,
    contentType: pc.contentType as string,
    caption: payload.caption ?? '',
    hashtags: String(pc.hashtags ?? ''),
    cta: payload.cta ?? null,
    firstComment: payload.firstComment ?? null,
    mediaKind: media?.kind ?? null,
    mediaStorageKey: media?.storageKey ?? null,
    mediaUrl: media?.url ?? null,
    mediaWidth: media?.width ?? null,
    mediaHeight: media?.height ?? null,
    contentVersion: pc.content?.version ?? 1,
    platformRuleVersion: rule.version ?? null,
    accountHandle: payload.account.handle || null,
    accountExternalId: payload.account.externalId ?? null
  };
}

async function absoluteMediaUrl(storageKey: string, fallback: string | null): Promise<string> {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const relative = storage().url(storageKey);
  if (relative.startsWith('http')) return relative;
  return `${base.replace(/\/$/, '')}${relative}`;
}

/**
 * İçerik durumunu çocuklardan türetir.
 * Kısmi başarı → PARTIALLY_PUBLISHED (tüm kampanya "başarısız" işaretlenmez).
 */
export async function rollupContentStatus(contentId: string): Promise<string> {
  const children = await prisma.platformContent.findMany({
    where: { contentId, enabled: true },
    select: { status: true, scheduledFor: true }
  });
  if (!children.length) return 'DRAFT';

  const counts = {
    published: children.filter((c) => c.status === 'PUBLISHED').length,
    failed: children.filter((c) => c.status === 'FAILED').length,
    publishing: children.filter((c) => c.status === 'PUBLISHING' || c.status === 'PROCESSING').length,
    scheduled: children.filter((c) => c.status === 'SCHEDULED').length,
    approval: children.filter((c) => c.status === 'APPROVAL_PENDING').length,
    draft: children.filter((c) => c.status === 'DRAFT').length
  };

  let status = 'DRAFT';
  if (counts.publishing > 0) status = 'PUBLISHING';
  else if (counts.published === children.length) status = 'PUBLISHED';
  else if (counts.published > 0 && counts.failed > 0) status = 'PARTIALLY_PUBLISHED';
  else if (counts.published > 0 && counts.scheduled > 0) status = 'PARTIALLY_PUBLISHED';
  else if (counts.failed > 0) status = 'FAILED';
  else if (counts.approval > 0) status = 'APPROVAL_PENDING';
  else if (counts.scheduled > 0) status = 'SCHEDULED';

  const previous = await prisma.content.findUnique({
    where: { id: contentId },
    select: { status: true, workspaceId: true, title: true }
  });

  await prisma.content.update({
    where: { id: contentId },
    data: {
      status,
      publishedAt: status === 'PUBLISHED' || status === 'PARTIALLY_PUBLISHED' ? new Date() : null
    }
  });

  // Kısmi başarı: içerik-bazlı tek bildirim (durum değişiminde bir kez) — §56
  if (status === 'PARTIALLY_PUBLISHED' && previous && previous.status !== 'PARTIALLY_PUBLISHED') {
    const { notify } = await import('../services/notifications');
    await notify(previous.workspaceId, {
      type: 'PUBLICATION_PARTIAL_SUCCESS',
      title: 'Yayın kısmen tamamlandı',
      message: `"${previous.title}" kısmen yayınlandı: ${counts.published} platformda yayınlandı, ${counts.failed + counts.scheduled} platform başarısız/bekliyor.`,
      severity: 'WARNING',
      contentId,
      actionLabel: 'İçeriği Gör',
      actionRoute: `/app/icerik/${contentId}`
    });
  }
  return status;
}
