import prisma from '../prisma';
import { BUILTIN_RULES, type BuiltinRule } from '../platforms/builtinRules';
import type { ContentType, PlatformCode } from '../platforms/platforms';

/**
 * Platform Kural Motoru (PlatformRule engine)
 * ---------------------------------------------------------------------------
 * Tüm medya ve açıklama doğrulamaları BU motor üzerinden yapılır.
 * Kurallar veritabanında (`PlatformRule`) tutulur; bileşenlerde sabit değer
 * YOKTUR. Böylece sosyal medya API'leri değiştikçe kurallar Admin Ayarları'ndan
 * veya `syncRules()` ile güncellenebilir.
 */

export interface PlatformRuleView {
  id: string | null;
  platform: PlatformCode;
  contentType: ContentType;
  label: string;
  maxCaptionLength: number;
  recommendedCaptionLength: number;
  minCaptionLength: number;
  supportedAspectRatios: string[];
  recommendedAspectRatio: string;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  maxFileSize: number;
  maxVideoFileSize: number | null;
  supportedMimeTypes: string[];
  supportedImageFormats: string[];
  supportedVideoFormats: string[];
  maxVideoDuration: number | null;
  minVideoDuration: number | null;
  maxMediaCount: number;
  maxHashtags: number;
  recommendedHashtags: number;
  hashtagRecommendation: string[];
  supportsLinks: boolean;
  clickableLinks: boolean;
  supportsStories: boolean;
  supportsCarousel: boolean;
  supportsReels: boolean;
  supportsScheduling: boolean;
  supportsFirstComment: boolean;
  supportsLocation: boolean;
  supportsMentions: boolean;
  supportsAltText: boolean;
  supportsThreads: boolean;
  safeArea: { top: number; bottom: number; left: number; right: number } | null;
  restrictions: string[];
  apiVersion: string;
  capabilities: string[];
  source: string;
  lastUpdatedAt: Date;
  /** URL karakter ağırlığı (X için 23, diğerleri 0). */
  urlWeight: number;
}

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (!raw) return [];
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(raw: unknown): T | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
}

/** X/Twitter bağlantıları 23 karakter sayar (t.co). */
const URL_WEIGHTS: Partial<Record<PlatformCode, number>> = { X: 23 };

function fromRow(row: any): PlatformRuleView {
  return {
    id: row.id ?? null,
    platform: row.platform,
    contentType: row.contentType,
    label: row.label,
    maxCaptionLength: row.maxCaptionLength,
    recommendedCaptionLength: row.recommendedCaptionLength,
    minCaptionLength: row.minCaptionLength ?? 0,
    supportedAspectRatios: parseJsonArray(row.supportedAspectRatios),
    recommendedAspectRatio: row.recommendedAspectRatio,
    minWidth: row.minWidth,
    minHeight: row.minHeight,
    maxWidth: row.maxWidth ?? 4096,
    maxHeight: row.maxHeight ?? 4096,
    maxFileSize: (row.maxFileSizeKb ?? Math.round((row.maxFileSize ?? 0) / 1024)) * 1024,
    maxVideoFileSize: row.maxVideoFileSizeKb != null ? row.maxVideoFileSizeKb * 1024 : null,
    supportedMimeTypes: parseJsonArray(row.supportedMimeTypes),
    supportedImageFormats: parseJsonArray(row.supportedImageFormats),
    supportedVideoFormats: parseJsonArray(row.supportedVideoFormats),
    maxVideoDuration: row.maxVideoDuration ?? null,
    minVideoDuration: row.minVideoDuration ?? null,
    maxMediaCount: row.maxMediaCount ?? 1,
    maxHashtags: row.maxHashtags ?? 0,
    recommendedHashtags: row.recommendedHashtags ?? 0,
    hashtagRecommendation: parseJsonArray(row.hashtagRecommendation),
    supportsLinks: Boolean(row.supportsLinks),
    clickableLinks: Boolean(row.clickableLinks),
    supportsStories: Boolean(row.supportsStories),
    supportsCarousel: Boolean(row.supportsCarousel),
    supportsReels: Boolean(row.supportsReels),
    supportsScheduling: row.supportsScheduling !== false,
    supportsFirstComment: Boolean(row.supportsFirstComment),
    supportsLocation: Boolean(row.supportsLocation),
    supportsMentions: row.supportsMentions !== false,
    supportsAltText: Boolean(row.supportsAltText),
    supportsThreads: Boolean(row.supportsThreads),
    safeArea: parseJsonObject(row.safeArea),
    restrictions: parseJsonArray(row.restrictions),
    apiVersion: row.apiVersion ?? 'v1',
    capabilities: parseJsonArray(row.capabilities),
    source: row.source ?? 'BUILTIN',
    lastUpdatedAt: row.lastUpdatedAt ? new Date(row.lastUpdatedAt) : new Date(),
    urlWeight: URL_WEIGHTS[row.platform as PlatformCode] ?? 0
  };
}

function fromBuiltin(b: BuiltinRule): PlatformRuleView {
  return fromRow({
    ...b,
    supportedAspectRatios: JSON.stringify(b.supportedAspectRatios),
    supportedMimeTypes: JSON.stringify(b.supportedMimeTypes),
    supportedImageFormats: JSON.stringify(b.supportedImageFormats ?? []),
    supportedVideoFormats: JSON.stringify(b.supportedVideoFormats ?? []),
    hashtagRecommendation: JSON.stringify(b.hashtagRecommendation ?? []),
    restrictions: JSON.stringify(b.restrictions ?? []),
    capabilities: JSON.stringify(b.capabilities ?? []),
    safeArea: b.safeArea ? JSON.stringify(b.safeArea) : null,
    maxHashtags: b.maxHashtags ?? 0,
    recommendedHashtags: b.recommendedHashtags ?? 0,
    maxMediaCount: b.maxMediaCount ?? 1,
    source: 'BUILTIN',
    lastUpdatedAt: new Date()
  });
}

const cache = new Map<string, { at: number; rules: PlatformRuleView[] }>();
const CACHE_TTL = 15_000;

export async function getAllRules(workspaceId: string, force = false): Promise<PlatformRuleView[]> {
  const key = workspaceId;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL) return hit.rules;

  const rows = await prisma.platformRule.findMany({ where: { workspaceId, active: true } });
  const rules = rows.length ? rows.map(fromRow) : BUILTIN_RULES.map(fromBuiltin);
  cache.set(key, { at: Date.now(), rules });
  return rules;
}

export function invalidateRuleCache(workspaceId?: string) {
  if (workspaceId) cache.delete(workspaceId);
  else cache.clear();
}

export async function getRule(
  workspaceId: string,
  platform: PlatformCode | string,
  contentType: ContentType | string
): Promise<PlatformRuleView | null> {
  const rules = await getAllRules(workspaceId);
  return rules.find((r) => r.platform === platform && r.contentType === contentType) ?? null;
}

/** Bir platformun tüm içerik türleri için kuralları. */
export async function getRulesForPlatform(
  workspaceId: string,
  platform: PlatformCode | string
): Promise<PlatformRuleView[]> {
  const rules = await getAllRules(workspaceId);
  return rules.filter((r) => r.platform === platform);
}

/**
 * Yerleşik kuralları veritabanına yazar (yalnızca eksik olanları).
 * Seed ve "Kuralları sıfırla" aksiyonu tarafından kullanılır.
 */
export async function ensureRules(workspaceId: string, force = false): Promise<number> {
  const existing = await prisma.platformRule.findMany({
    where: { workspaceId },
    select: { platform: true, contentType: true }
  });
  const existingKeys = new Set(existing.map((e) => `${e.platform}:${e.contentType}`));
  let created = 0;

  for (const b of BUILTIN_RULES) {
    const key = `${b.platform}:${b.contentType}`;
    if (existingKeys.has(key) && !force) continue;
    const data = {
      label: b.label,
      maxCaptionLength: b.maxCaptionLength,
      recommendedCaptionLength: b.recommendedCaptionLength,
      minCaptionLength: b.minCaptionLength ?? 0,
      supportedAspectRatios: JSON.stringify(b.supportedAspectRatios),
      recommendedAspectRatio: b.recommendedAspectRatio,
      minWidth: b.minWidth,
      minHeight: b.minHeight,
      maxWidth: b.maxWidth ?? 4096,
      maxHeight: b.maxHeight ?? 4096,
      maxFileSizeKb: Math.round(b.maxFileSize / 1024),
      maxVideoFileSizeKb: b.maxVideoFileSize != null ? Math.round(b.maxVideoFileSize / 1024) : null,
      supportedMimeTypes: JSON.stringify(b.supportedMimeTypes),
      supportedImageFormats: JSON.stringify(b.supportedImageFormats ?? []),
      supportedVideoFormats: JSON.stringify(b.supportedVideoFormats ?? []),
      maxVideoDuration: b.maxVideoDuration ?? null,
      minVideoDuration: b.minVideoDuration ?? null,
      maxMediaCount: b.maxMediaCount ?? 1,
      maxHashtags: b.maxHashtags ?? 0,
      recommendedHashtags: b.recommendedHashtags ?? 0,
      hashtagRecommendation: JSON.stringify(b.hashtagRecommendation ?? []),
      supportsLinks: b.supportsLinks ?? false,
      clickableLinks: b.clickableLinks ?? false,
      supportsStories: b.supportsStories ?? false,
      supportsCarousel: b.supportsCarousel ?? false,
      supportsReels: b.supportsReels ?? false,
      supportsScheduling: b.supportsScheduling ?? true,
      supportsFirstComment: b.supportsFirstComment ?? false,
      supportsLocation: b.supportsLocation ?? false,
      supportsMentions: b.supportsMentions ?? true,
      supportsAltText: b.supportsAltText ?? false,
      supportsThreads: b.supportsThreads ?? false,
      safeArea: b.safeArea ? JSON.stringify(b.safeArea) : null,
      restrictions: JSON.stringify(b.restrictions ?? []),
      apiVersion: b.apiVersion ?? 'v1',
      capabilities: JSON.stringify(b.capabilities ?? []),
      source: 'BUILTIN',
      lastUpdatedAt: new Date()
    };

    if (force) {
      await prisma.platformRule.upsert({
        where: { workspaceId_platform_contentType: { workspaceId, platform: b.platform, contentType: b.contentType } },
        create: { workspaceId, platform: b.platform, contentType: b.contentType, ...data },
        update: data
      });
    } else {
      await prisma.platformRule.create({
        data: { workspaceId, platform: b.platform, contentType: b.contentType, ...data }
      });
    }
    created++;
  }

  invalidateRuleCache(workspaceId);
  return created;
}

/**
 * Kuralları günceller (Admin Ayarları veya gelecekteki API senkron işi).
 * `source` alanı BUILTIN → MANUAL / SYNCED olarak değişir.
 */
export async function updateRule(
  workspaceId: string,
  platform: string,
  contentType: string,
  patch: Partial<BuiltinRule> & { active?: boolean }
): Promise<PlatformRuleView> {
  const where = { workspaceId_platform_contentType: { workspaceId, platform, contentType } } as const;
  await ensureRules(workspaceId);

  const normalize = (p: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...p };
    // Dosya boyutları API'den bayt olarak gelir, KB olarak saklanır.
    if (typeof out.maxFileSize === 'number') {
      out.maxFileSizeKb = Math.round((out.maxFileSize as number) / 1024);
      delete out.maxFileSize;
    }
    if (typeof out.maxVideoFileSize === 'number') {
      out.maxVideoFileSizeKb = Math.round((out.maxVideoFileSize as number) / 1024);
      delete out.maxVideoFileSize;
    }
    for (const key of [
      'supportedAspectRatios',
      'supportedMimeTypes',
      'supportedImageFormats',
      'supportedVideoFormats',
      'hashtagRecommendation',
      'restrictions',
      'capabilities'
    ]) {
      if (Array.isArray(out[key])) out[key] = JSON.stringify(out[key]);
    }
    if (out.safeArea && typeof out.safeArea === 'object') out.safeArea = JSON.stringify(out.safeArea);
    return out;
  };

  const data = normalize({ ...patch, source: 'MANUAL', lastUpdatedAt: new Date() } as Record<string, unknown>);

  const row = await prisma.platformRule.update({ where, data: data as any });
  invalidateRuleCache(workspaceId);
  return fromRow(row);
}

/** Kural motorunun özet görünümü (kullanıcı arayüzü için). */
export function summarizeRule(rule: PlatformRuleView): string {
  const bits = [`${rule.maxCaptionLength} karakter`, rule.recommendedAspectRatio];
  if (rule.maxMediaCount > 1) bits.push(`${rule.maxMediaCount} medya`);
  if (rule.maxHashtags > 0) bits.push(`≤${rule.maxHashtags} etiket`);
  return bits.join(' · ');
}
