/**
 * MediaProcessingService (§44)
 * ---------------------------------------------------------------------------
 * Sorumluluklar:
 *   - Orijinal medyanın meta verisini okumak/doğrulamak
 *   - Platform kuralına göre türev (varyant) üretmek: kırpma, ölçekleme,
 *     sıkıştırma, güvenli format dönüşümü, kapak/önizleme görseli
 *   - Her türevi `MediaVariant` kaydı olarak izlemek (durum + meta veri)
 *
 * İLKELER
 *   - Orijinal dosya ASLA değiştirilmez veya üzerine yazılmaz (§42).
 *   - Görsel ASLA esnetilmez (en-boy oranı korunur) (§45).
 *   - Phase 1 kırpma yöntemi deterministiktir: kullanıcının seçtiği odak noktası
 *     varsa onu, yoksa kare/orta bölgeyi kullanır. Bu yöntem "AI akıllı kırpma"
 *     olarak ETİKETLENMEZ (§46); ileride saliency/face tespiti eklenebilir.
 *   - Bir türev başarısız olursa orijinal, içerik taslağı ve diğer türevler
 *     KORUNUR (§70).
 *
 * Not: Piksel işleme tarayıcıda (canvas) yapılır; bu servis meta veri,
 * kayıt ve durum yönetiminin sunucu tarafıdır. Böylece aynı iş hem web
 * istemcisinden hem (ileride) worker'dan çağrılabilir (§74).
 */
import prisma from '../prisma';
import { storage, makeStorageKey } from '../storage/storage';
import { logger } from '../observability';
import { audit } from '../security/audit';
import { mediaProcessingFailed, notFound } from '../errors';
import type { FocalPoint } from '../media/types';

export type VariantProcessingStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface CreateVariantInput {
  workspaceId: string;
  mediaAssetId: string;
  platform?: string | null;
  contentType?: string | null;
  kind?: 'CROP' | 'SCALE' | 'THUMBNAIL' | 'COVER' | 'VIDEO_POSTER';
  aspectRatio?: string | null;
  /** Üretilen türevin ikili verisi. Boşsa yalnızca kayıt açılır (PENDING). */
  bytes?: Buffer | Uint8Array | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  focalPoint?: FocalPoint | null;
  cropMode?: 'SMART' | 'MANUAL' | 'FIT';
  processingMethod?: 'DETERMINISTIC' | 'USER_FOCAL_POINT' | 'AI_SALIENCY';
  crop?: { x: number; y: number; w: number; h: number } | null;
  createdById?: string | null;
}

/**
 * Varyant kaydı oluşturur. İkili veri verilmişse depoya yazar ve READY yapar;
 * verilmemişse PENDING kaydı açar (işlenmeyi bekliyor).
 */
export async function createMediaVariant(input: CreateVariantInput) {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: input.mediaAssetId, workspaceId: input.workspaceId }
  });
  if (!asset) throw notFound('Medya bulunamadı.');

  const key = {
    mediaAssetId: asset.id,
    platform: input.platform ?? '',
    contentType: input.contentType ?? '',
    aspectRatio: input.aspectRatio ?? ''
  };

  try {
    if (!input.bytes || input.bytes.length === 0) {
      // İşlenmeyi bekleyen kayıt (worker tarafından tamamlanır).
      return await prisma.mediaVariant.upsert({
        where: { mediaAssetId_platform_contentType_aspectRatio: key },
        update: { processingStatus: 'PENDING', processingMetadata: JSON.stringify({ reason: 'awaiting_processing' }) },
        create: {
          ...key,
          workspaceId: input.workspaceId,
          kind: input.kind ?? 'CROP',
          storageKey: `${asset.storageKey}#variant`,
          mimeType: input.mimeType ?? asset.mimeType,
          width: input.width ?? null,
          height: input.height ?? null,
          durationMs: input.durationMs ?? null,
          focalPoint: input.focalPoint ? JSON.stringify(input.focalPoint) : null,
          cropMode: input.cropMode ?? 'SMART',
          processingMethod: input.processingMethod ?? 'DETERMINISTIC',
          processingStatus: 'PENDING',
          createdById: input.createdById ?? null
        }
      });
    }

    const buf = Buffer.from(input.bytes);
    const ext = (input.mimeType ?? asset.mimeType).split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const slug = `${(input.platform ?? 'genel').toLowerCase()}-${(input.contentType ?? 'genel').toLowerCase()}`;
    const filename = `${asset.filename.replace(/\.[^.]+$/, '')}-${slug}-${input.width ?? 'x'}x${input.height ?? 'x'}.${ext}`;
    const storageKey = makeStorageKey(input.workspaceId, 'variants', filename);
    const stored = await storage().put(storageKey, buf, input.mimeType ?? asset.mimeType);

    const variant = await prisma.mediaVariant.upsert({
      where: { mediaAssetId_platform_contentType_aspectRatio: key },
      update: {
        storageKey,
        publicUrl: stored.publicUrl,
        mimeType: input.mimeType ?? asset.mimeType,
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
        bytes: buf.length,
        focalPoint: input.focalPoint ? JSON.stringify(input.focalPoint) : null,
        cropMode: input.cropMode ?? 'SMART',
        processingMethod: input.processingMethod ?? 'DETERMINISTIC',
        processingStatus: 'READY',
        processingMetadata: JSON.stringify({
          crop: input.crop ?? null,
          sourceWidth: asset.width,
          sourceHeight: asset.height,
          sourceKey: asset.storageKey
        })
      },
      create: {
        ...key,
        workspaceId: input.workspaceId,
        kind: input.kind ?? 'CROP',
        storageKey,
        publicUrl: stored.publicUrl,
        mimeType: input.mimeType ?? asset.mimeType,
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
        bytes: buf.length,
        focalPoint: input.focalPoint ? JSON.stringify(input.focalPoint) : null,
        cropMode: input.cropMode ?? 'SMART',
        processingMethod: input.processingMethod ?? 'DETERMINISTIC',
        processingStatus: 'READY',
        processingMetadata: JSON.stringify({
          crop: input.crop ?? null,
          sourceWidth: asset.width,
          sourceHeight: asset.height,
          sourceKey: asset.storageKey
        }),
        createdById: input.createdById ?? null
      }
    });

    // Orijinal medya durumu: varyant üretimi orijinali değiştirmez.
    await prisma.mediaAsset
      .update({ where: { id: asset.id }, data: { status: 'READY' } })
      .catch(() => undefined);

    await audit({
      workspaceId: input.workspaceId,
      userId: input.createdById ?? null,
      action: 'media.variant.created',
      entityType: 'MediaVariant',
      entityId: variant.id,
      metadata: { platform: input.platform, contentType: input.contentType, aspectRatio: input.aspectRatio }
    });

    return variant;
  } catch (error) {
    // Hata durumunda: orijinal ve diğer varyantlar korunur; yalnızca bu kayıt FAILED olur.
    logger.error({
      event: 'media.variant_failed',
      workspaceId: input.workspaceId,
      mediaAssetId: input.mediaAssetId,
      platform: input.platform,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    await prisma.mediaVariant
      .upsert({
        where: { mediaAssetId_platform_contentType_aspectRatio: key },
        update: {
          processingStatus: 'FAILED',
          processingMetadata: JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
        },
        create: {
          ...key,
          workspaceId: input.workspaceId,
          kind: input.kind ?? 'CROP',
          storageKey: `${asset.storageKey}#failed`,
          mimeType: input.mimeType ?? asset.mimeType,
          processingStatus: 'FAILED',
          processingMetadata: JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
        }
      })
      .catch(() => undefined);

    throw mediaProcessingFailed(error, { mediaAssetId: input.mediaAssetId });
  }
}

/** Bir medyanın tüm varyantları. */
export async function listMediaVariants(workspaceId: string, mediaAssetId: string) {
  return prisma.mediaVariant.findMany({
    where: { workspaceId, mediaAssetId },
    orderBy: { createdAt: 'asc' }
  });
}

/**
 * Belirli bir platform/içerik türü/oran için varyantı döner; yoksa null.
 * Composer, platform önizlemesinde önce kayıtlı varyantı arar, yoksa
 * tarayıcıda üretir.
 */
export async function findVariant(params: {
  workspaceId: string;
  mediaAssetId: string;
  platform: string;
  contentType: string;
  aspectRatio: string;
}) {
  return prisma.mediaVariant.findFirst({
    where: {
      workspaceId: params.workspaceId,
      mediaAssetId: params.mediaAssetId,
      platform: params.platform,
      contentType: params.contentType,
      aspectRatio: params.aspectRatio,
      processingStatus: 'READY'
    },
    orderBy: { createdAt: 'desc' }
  });
}

/** Varyantı siler. Orijinal medya ve diğer varyantlar etkilenmez. */
export async function deleteMediaVariant(workspaceId: string, variantId: string) {
  const variant = await prisma.mediaVariant.findFirst({ where: { id: variantId, workspaceId } });
  if (!variant) throw notFound('Medya varyantı bulunamadı.');

  await storage().delete(variant.storageKey).catch(() => undefined);
  await prisma.mediaVariant.delete({ where: { id: variant.id } });

  await audit({
    workspaceId,
    action: 'media.variant.deleted',
    entityType: 'MediaVariant',
    entityId: variantId,
    metadata: { platform: variant.platform, contentType: variant.contentType }
  });

  return { deleted: true };
}

/**
 * Medyanın kullanım durumu: hangi içerikler/PlatformContent kayıtları
 * referans veriyor? Silme güvenliği için kullanılır (§87).
 */
export async function mediaUsage(workspaceId: string, mediaAssetId: string) {
  const [platformTargets, variants] = await Promise.all([
    prisma.platformContent.findMany({
      where: { mediaAssetId, content: { workspaceId } },
      select: { id: true, platform: true, contentType: true, contentId: true, content: { select: { title: true, status: true } } }
    }),
    prisma.mediaVariant.count({ where: { workspaceId, mediaAssetId } })
  ]);

  const activeStatuses = new Set(['DRAFT', 'PROCESSING', 'READY', 'SCHEDULED', 'APPROVAL_PENDING']);
  const active = platformTargets.filter((p) => activeStatuses.has(p.content.status));

  return {
    total: platformTargets.length,
    activeReferences: active.length,
    references: platformTargets.map((p) => ({
      contentId: p.contentId,
      title: p.content.title,
      status: p.content.status,
      platform: p.platform,
      contentType: p.contentType
    })),
    variants,
    safeToDelete: active.length === 0
  };
}
