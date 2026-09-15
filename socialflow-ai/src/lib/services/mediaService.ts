import prisma from '../prisma';
import { storage, makeStorageKey } from '../storage/storage';
import { sha256 } from '../crypto';
import { audit } from '../security/audit';
import { AppError, notFound } from '../errors';
import { mediaUsage } from './mediaProcessingService';
import type { MediaVariant, FocalPoint, MediaAnalysis } from '../media/types';

/**
 * MediaService — medya kütüphanesi ve varyant yönetimi.
 * ---------------------------------------------------------------------------
 * - Aynı dosya iki kez yüklenmez (SHA-256 içerik hash'i ile tekilleştirme).
 * - Orijinal master medya ASLA değiştirilmez; varyantlar ayrı dosyalardır.
 * - Üretilen varyantlar `MediaAsset.derivatives` alanında izlenir.
 */

export interface UploadInput {
  workspaceId: string;
  brandId?: string | null;
  folderId?: string | null;
  originalName: string;
  mimeType: string;
  bytes: Buffer | Uint8Array;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  focalPoint?: FocalPoint | null;
  analysis?: MediaAnalysis | null;
  tags?: string[];
  campaign?: string | null;
  kind?: 'IMAGE' | 'VIDEO' | 'LOGO';
  createdBy?: string | null;
  clientHash?: string | null;
}

export async function uploadMedia(input: UploadInput) {
  const buf = Buffer.from(input.bytes);
  const contentHash = input.clientHash || sha256(buf);

  // Tekilleştirme
  const existing = await prisma.mediaAsset.findFirst({
    where: { workspaceId: input.workspaceId, contentHash }
  });
  if (existing) {
    return { asset: existing, deduplicated: true };
  }

  const ext = extensionFromMime(input.mimeType, input.originalName);
  const filename = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storageKey = makeStorageKey(input.workspaceId, 'originals', filename);

  const stored = await storage().put(storageKey, buf, input.mimeType);

  const kind = input.kind ?? (input.mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE');
  const asset = await prisma.mediaAsset.create({
    data: {
      workspaceId: input.workspaceId,
      brandId: input.brandId ?? null,
      folderId: input.folderId ?? null,
      kind,
      filename,
      originalName: input.originalName.slice(0, 240),
      storageKey,
      publicUrl: stored.publicUrl,
      mimeType: input.mimeType,
      format: ext,
      bytes: buf.length,
      width: input.width ?? null,
      height: input.height ?? null,
      durationMs: input.durationMs ?? null,
      aspectRatio: input.width && input.height ? input.width / input.height : null,
      contentHash,
      focalPoint: input.focalPoint ? JSON.stringify(input.focalPoint) : null,
      analysis: input.analysis ? JSON.stringify(input.analysis) : null,
      tags: (input.tags ?? []).join(','),
      campaign: input.campaign ?? null,
      status: 'READY',
      createdBy: input.createdBy ?? null
    }
  });

  return { asset, deduplicated: false };
}

export interface VariantUploadInput {
  workspaceId: string;
  mediaId: string;
  platform: string;
  contentType: string;
  ratio: string;
  width: number;
  height: number;
  bytes: Buffer | Uint8Array;
  mimeType: string;
  crop?: { x: number; y: number; w: number; h: number } | null;
  method?: MediaVariant['method'];
  focalPoint?: FocalPoint | null;
}

/**
 * Üretilen platform varyantını saklar. Orijinal dosyaya dokunulmaz.
 * Depolama adı kuralı: originals/... → variants/<platform>-<contentType>.<ext>
 */
export async function saveVariant(input: VariantUploadInput) {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: input.mediaId, workspaceId: input.workspaceId }
  });
  if (!asset) throw new Error('Medya bulunamadı.');

  const buf = Buffer.from(input.bytes);
  const ext = extensionFromMime(input.mimeType, asset.filename);
  const slug = `${input.platform.toLowerCase()}-${input.contentType.toLowerCase()}`;
  const filename = `${asset.filename.replace(/\.[^.]+$/, '')}-${slug}-${input.width}x${input.height}.${ext}`;
  const storageKey = makeStorageKey(input.workspaceId, 'variants', filename);

  const stored = await storage().put(storageKey, buf, input.mimeType);

  const variants = parseVariants(asset.derivatives).filter(
    (v) => !(v.platform === input.platform && v.contentType === input.contentType)
  );
  variants.push({
    platform: input.platform as MediaVariant['platform'],
    contentType: input.contentType as MediaVariant['contentType'],
    ratio: input.ratio,
    width: input.width,
    height: input.height,
    bytes: buf.length,
    storageKey,
    publicUrl: stored.publicUrl,
    crop: input.crop ?? undefined,
    method: input.method ?? 'SMART_CROP',
    focalPoint: input.focalPoint ?? undefined
  });

  const updated = await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: { derivatives: JSON.stringify(variants) }
  });

  // MediaVariant kaydı (§43): türev, orijinalden bağımsız izlenebilir bir varlık
  // olarak da saklanır. Orijinal dosya değişmez (§42).
  await prisma.mediaVariant
    .upsert({
      where: {
        mediaAssetId_platform_contentType_aspectRatio: {
          mediaAssetId: asset.id,
          platform: input.platform,
          contentType: input.contentType,
          aspectRatio: input.ratio
        }
      },
      update: {
        storageKey,
        publicUrl: stored.publicUrl,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        bytes: buf.length,
        focalPoint: input.focalPoint ? JSON.stringify(input.focalPoint) : null,
        cropMode: input.method === 'MANUAL' ? 'MANUAL' : 'SMART',
        processingStatus: 'READY',
        processingMetadata: JSON.stringify({ crop: input.crop ?? null, sourceKey: asset.storageKey })
      },
      create: {
        mediaAssetId: asset.id,
        workspaceId: input.workspaceId,
        platform: input.platform,
        contentType: input.contentType,
        aspectRatio: input.ratio,
        kind: 'CROP',
        storageKey,
        publicUrl: stored.publicUrl,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        bytes: buf.length,
        focalPoint: input.focalPoint ? JSON.stringify(input.focalPoint) : null,
        cropMode: input.method === 'MANUAL' ? 'MANUAL' : 'SMART',
        processingMethod: input.focalPoint ? 'USER_FOCAL_POINT' : 'DETERMINISTIC',
        processingStatus: 'READY',
        processingMetadata: JSON.stringify({ crop: input.crop ?? null, sourceKey: asset.storageKey })
      }
    })
    .catch(() => undefined);

  return { asset: updated, storageKey, publicUrl: stored.publicUrl };
}

export async function updateFocalPoint(mediaId: string, workspaceId: string, focalPoint: FocalPoint) {
  return prisma.mediaAsset.update({
    where: { id: mediaId },
    data: { focalPoint: JSON.stringify({ ...focalPoint, method: 'MANUAL' }) }
  });
}

export async function listMedia(
  workspaceId: string,
  filter: { kind?: string; brandId?: string; campaign?: string; tag?: string; q?: string; limit?: number; cursor?: string } = {}
) {
  const where: any = { workspaceId };
  if (filter.kind) where.kind = filter.kind;
  if (filter.brandId) where.brandId = filter.brandId;
  if (filter.campaign) where.campaign = filter.campaign;
  if (filter.tag) where.tags = { contains: filter.tag };
  if (filter.q) {
    where.OR = [
      { originalName: { contains: filter.q } },
      { filename: { contains: filter.q } },
      { tags: { contains: filter.q } },
      { campaign: { contains: filter.q } }
    ];
  }
  const items = await prisma.mediaAsset.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filter.limit ?? 60,
    include: { brand: { select: { id: true, name: true } } }
  });
  return items;
}

/**
 * Medyayı siler. Silme ÖNCESİ aktif referans kontrolü yapılır (§87):
 * yayında/planlı/taslak bir içerik bu medyayı kullanıyorsa silme reddedilir.
 * Arşivlenmiş içeriklerdeki referanslar silmeyi engellemez.
 */
export async function deleteMedia(mediaId: string, workspaceId: string, options: { force?: boolean } = {}) {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: mediaId, workspaceId } });
  if (!asset) throw notFound('Medya bulunamadı.');

  const usage = await mediaUsage(workspaceId, mediaId);
  if (!usage.safeToDelete && !options.force) {
    throw new AppError(
      'CONFLICT',
      `Bu medya ${usage.activeReferences} aktif içerikte kullanılıyor. Silmek yerine içeriklerden kaldırın veya arşivleyin.`,
      { status: 409, details: usage }
    );
  }

  const variants = await prisma.mediaVariant.findMany({ where: { workspaceId, mediaAssetId: mediaId } });
  const legacyVariants = parseVariants(asset.derivatives);

  await prisma.$transaction([
    prisma.mediaVariant.deleteMany({ where: { workspaceId, mediaAssetId: mediaId } }),
    prisma.contentMedia.deleteMany({ where: { mediaId } }),
    prisma.mediaAsset.delete({ where: { id: mediaId } })
  ]);

  // Depolama temizliği (orijinal + tüm türevler) — dosya silinemezse akış bozulmaz.
  await storage().delete(asset.storageKey).catch(() => undefined);
  for (const v of variants) await storage().delete(v.storageKey).catch(() => undefined);
  for (const v of legacyVariants) if (v.storageKey) await storage().delete(v.storageKey).catch(() => undefined);

  await audit({
    workspaceId,
    action: 'media.deleted',
    entityType: 'MediaAsset',
    entityId: mediaId,
    metadata: { originalName: asset.originalName, variants: variants.length }
  });

  return { deleted: true, variants: variants.length };
}

export function parseVariants(raw: string | null | undefined): MediaVariant[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as MediaVariant[]) : [];
  } catch {
    return [];
  }
}

export function parseFocalPoint(raw: string | null | undefined): FocalPoint | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FocalPoint;
  } catch {
    return null;
  }
}

export function parseAnalysis(raw: string | null | undefined): MediaAnalysis | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MediaAnalysis;
  } catch {
    return null;
  }
}

function extensionFromMime(mime: string, filename: string): string {
  const fromName = filename.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov'
  };
  return map[mime] ?? 'bin';
}
