/**
 * PHASE 4 — AI Studio servis katmanı (§50-§51, §59-§67, §122)
 * ---------------------------------------------------------------------------
 * SUNUCU TARAFINDA çalışır; istemci asla üretimi taklit etmez.
 *
 * Üretim zinciri (her çağrıda):
 *   prompt + Marka Kiti bağlamı
 *     → AiImageGeneration kaydı (sağlayıcı/soyutlama üzerinden)
 *     → MediaAsset (YENİ kayıt; orijinal/asıl varlık asla üzerine yazılmaz §67)
 *     → MasterCreative (+ CreativeQualityScore şeffaf değerlendirme §68)
 *     → AiGeneration iz kaydı (§56) + AiUsage (§57)
 *
 * SAĞLAYICI SOYUTLAMASI (§52): Harici görsel sağlayıcısı (imageGeneration
 * yeteneği) yapılandırılmışsa o kullanılır; bugün kullanılabilir adaptör yoksa
 * DETERMİNİSTİK yerel motor devreye girer: marka renkleri/kurallarıyla
 * bileştirilmiş SVG kreatif üretir. Çıktı GERÇEK dosya + GERÇEK DB kaydıdır ve
 * arayüzde "yerel motor" olarak dürüstçe etiketlenir — sahte görsel yoktur.
 */
import prisma from '../prisma';
import { storage, makeStorageKey } from '../storage/storage';
import { ensureBrandKit } from '../brandkit/service';
import { checkBrandConsistency } from './brandConsistency';
import { recordGeneration, hashPrompt } from './generationLog';
import { trackUsage, estimateCost } from './usage';
import { logger } from '../observability';

export type StudioAspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

export const ASPECT_SIZES: Record<StudioAspectRatio, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 }
};

export interface StudioGenerateInput {
  workspaceId: string;
  userId: string;
  brandId: string;
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio?: StudioAspectRatio;
  count?: number;
  visualStyle?: string | null;
  headline?: string | null;
  cta?: string | null;
  campaignId?: string | null;
}

export interface StudioCreativeResult {
  generationId: string;
  masterId: string;
  mediaAssetId: string;
  url: string | null;
  width: number;
  height: number;
  aspectRatio: string;
  provider: string;
  quality: QualitySummary;
  consistency: { score: number; gate: string; message: string };
}

export interface QualitySummary {
  overall: number;
  breakdown: Record<string, number>;
  warnings: string[];
}

/** Metni SVG'ye güvenle gömmek için kaçir (§111 sanitizasyon-by-construction). */
function esc(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Kontrast oranı (WCAG) — şeffaf kalite kontrolü için (§68). */
export function contrastRatio(hex1: string, hex2: string): number {
  const lum = (hex: string) => {
    const m = hex.replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
    const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(hex1);
  const l2 = lum(hex2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = w;
      if (lines.length >= maxLines) break;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current && lines.length < maxLines) lines.push(current.trim());
  return lines.slice(0, maxLines);
}

/** Basit hex '#RRGGBB' doğrulaması; geçersizse varsayılana düşer. */
function safeHex(hex: string | undefined | null, fallback: string): string {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback;
}

export interface BrandVisualContext {
  palette: string[];
  brandName: string;
  slogan: string | null;
  bannedTerms: string[];
  keywords: string[];
  negativeKeywords: string[];
  preferredCta: string | null;
  brandKitVersion: number;
  lockMode: string;
}

/** Marka Kitinden deterministik görsel bağlamı çıkarır (§60 marka-farkında üretim). */
export function brandVisualContext(kit: any): BrandVisualContext {
  const colors = (kit?.colors ?? []).filter((c: any) => !c.prohibited);
  const palette = colors.slice(0, 4).map((c: any) => safeHex(c.hex, '#6D28D9'));
  if (palette.length === 0) palette.push('#6D28D9');
  const keywords = (kit?.visualRules ?? [])
    .flatMap((r: any) => String(r.aiKeywords ?? '').split(','))
    .map((s: string) => s.trim())
    .filter(Boolean);
  const negativeKeywords = (kit?.visualRules ?? [])
    .flatMap((r: any) => String(r.negativeKeywords ?? '').split(','))
    .map((s: string) => s.trim())
    .filter(Boolean);
  const cta = (kit?.ctas ?? []).find((c: any) => c.category === 'PREFERRED' && c.approvalStatus === 'APPROVED');
  return {
    palette,
    brandName: kit?.brand?.name ?? '',
    slogan: kit?.mainSlogan ?? kit?.brand?.voice?.tone ?? null,
    bannedTerms: String(kit?.brand?.voice?.bannedTerms ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
    keywords,
    negativeKeywords,
    preferredCta: cta?.text ?? null,
    brandKitVersion: kit?.currentVersion ?? 1,
    lockMode: kit?.lockMode ?? 'OFF'
  };
}

type LayoutName = 'CENTERED' | 'SPLIT' | 'BANNER' | 'MINIMAL';

const LAYOUTS: LayoutName[] = ['CENTERED', 'SPLIT', 'BANNER', 'MINIMAL'];

const LAYOUT_LABELS: Record<LayoutName, string> = {
  CENTERED: 'Merkez kompozisyon',
  SPLIT: 'İkiye bölünmüş kompozisyon',
  BANNER: 'Alt bantlı kompozisyon',
  MINIMAL: 'Minimal kompozisyon'
};

/** Deterministik marka-farkında SVG kreatif üretir. */
export function renderCreativeSvg(opts: {
  w: number;
  h: number;
  ctx: BrandVisualContext;
  headline: string;
  subline?: string | null;
  cta?: string | null;
  layout: LayoutName;
}): string {
  const { w, h, ctx, layout } = opts;
  const bg = ctx.palette[0];
  const accent = safeHex(ctx.palette[1], ctx.palette[0]);
  const support = safeHex(ctx.palette[2], '#ffffff');
  // Kontrastı metin rengi seçiminde HESAPLARIZ (beyaz/siyah arasından yüksek olan).
  const whiteRatio = contrastRatio(bg, '#ffffff');
  const blackRatio = contrastRatio(bg, '#111111');
  const fg = whiteRatio >= blackRatio ? '#ffffff' : '#111111';
  const headlineLines = wrap(opts.headline, Math.floor(w / 46), 3);
  const headlineSize = Math.round(Math.min(w, h) / 14);
  const subSize = Math.round(headlineSize * 0.42);
  const pad = Math.round(Math.min(w, h) * 0.08); // güvenli alan (§63 safe zone)

  const texts = headlineLines
    .map(
      (line, i) =>
        `<text x="${pad}" y="${0}" fill="${fg}" font-family="Arial, sans-serif" font-size="${headlineSize}" font-weight="700">${esc(line)}</text>`
    )
    .join('');

  const groupTransform =
    layout === 'CENTERED'
      ? `translate(${pad}, ${h / 2 - (headlineLines.length * headlineSize) / 2})`
      : layout === 'SPLIT'
        ? `translate(${pad}, ${h * 0.62})`
        : layout === 'BANNER'
          ? `translate(${pad}, ${h - pad - headlineLines.length * headlineSize - subSize * 2.4})`
          : `translate(${pad}, ${pad + headlineSize})`;

  const ctaText = opts.cta ?? ctx.preferredCta;
  const ctaBlock = ctaText
    ? `<g transform="translate(${pad}, ${h - pad - Math.round(headlineSize * 0.9)})">
        <rect width="${Math.min(w - pad * 2, ctaText.length * headlineSize * 0.62 + headlineSize)}" height="${Math.round(headlineSize * 1.6)}" rx="${Math.round(headlineSize * 0.3)}" fill="${accent}" />
        <text x="${Math.round(headlineSize * 0.5)}" y="${Math.round(headlineSize * 1.12)}" fill="${fg}" font-family="Arial, sans-serif" font-size="${Math.round(headlineSize * 0.52)}" font-weight="700">${esc(ctaText)}</text>
      </g>`
    : '';

  const decorative =
    layout === 'SPLIT'
      ? `<rect x="0" y="0" width="${w}" height="${Math.round(h * 0.5)}" fill="${accent}" opacity="0.92" />
         <circle cx="${Math.round(w * 0.72)}" cy="${Math.round(h * 0.28)}" r="${Math.round(Math.min(w, h) * 0.16)}" fill="${support}" opacity="0.35" />`
      : layout === 'CENTERED'
        ? `<rect x="${pad / 2}" y="${pad / 2}" width="${w - pad}" height="${h - pad}" fill="none" stroke="${fg}" stroke-opacity="0.25" stroke-width="2" rx="24" />
           <circle cx="${Math.round(w * 0.5)}" cy="${Math.round(h * 0.2)}" r="${Math.round(Math.min(w, h) * 0.07)}" fill="${accent}" opacity="0.8" />`
        : layout === 'BANNER'
          ? `<rect x="0" y="${h - Math.round(h * 0.22)}" width="${w}" height="${Math.round(h * 0.22)}" fill="${accent}" opacity="0.85" />`
          : `<rect x="${pad}" y="${pad + headlineSize * 0.8}" width="${Math.round(w * 0.18)}" height="6" fill="${accent}" />`;

  const subline = opts.subline ?? ctx.slogan;
  const subBlock = subline
    ? `<text x="0" y="${headlineLines.length * headlineSize + Math.round(subSize * 1.4)}" fill="${fg}" fill-opacity="0.85" font-family="Arial, sans-serif" font-size="${subSize}">${esc(wrap(subline, Math.floor(w / 30), 1)[0] ?? '')}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bg}" />
  ${decorative}
  <g transform="${groupTransform}">
    ${texts}
    ${subBlock}
  </g>
  ${ctaBlock}
  <text x="${pad}" y="${h - pad / 2}" fill="${fg}" fill-opacity="0.5" font-family="Arial, sans-serif" font-size="${Math.round(headlineSize * 0.26)}">${esc(ctx.brandName)} · SocialFlow AI yerel motor</text>
</svg>`;
}

/** Görsel üretimini sağlayıcı soyutlamasıyla yapar; bugün deterministik motor üretir. */
function imageProviderName(): string {
  // imageGeneration yeteneği olan harici adaptör yapılandırıldığında burada
  // seçilir (§53 yetenek tabanlı yönlendirme). Mevcut adaptörler metin
  // yeteneklidir; bu yüzden dürüstçe 'deterministic' etiketlenir.
  return 'deterministic';
}

interface GeneratedImage {
  svg: string;
  layout: LayoutName;
}

function composeLayouts(input: StudioGenerateInput, ctx: BrandVisualContext, count: number): GeneratedImage[] {
  const ratio = input.aspectRatio ?? '1:1';
  const { w, h } = ASPECT_SIZES[ratio];
  const images: GeneratedImage[] = [];
  for (let i = 0; i < count; i++) {
    const layout = LAYOUTS[i % LAYOUTS.length];
    images.push({
      layout,
      svg: renderCreativeSvg({
        w,
        h,
        ctx,
        layout,
        headline: input.headline?.trim() || input.prompt.trim(),
        subline: ctx.slogan,
        cta: input.cta?.trim() || null
      })
    });
  }
  return images;
}

/** Şeffaf kreatif kalite değerlendirmesi (§68-§69) — üretilen kreatif üzerinde. */
export function evaluateStudioQuality(opts: {
  w: number;
  h: number;
  layout: LayoutName;
  headline: string;
  cta: string | null;
  ctx: BrandVisualContext;
  consistencyScore: number;
  platform?: string | null;
}): QualitySummary {
  const { w, h, ctx } = opts;
  const warnings: string[] = [];

  // Çözünürlük — en kısa kenar
  const shortEdge = Math.min(w, h);
  const resolution = shortEdge >= 1080 ? 100 : Math.round((shortEdge / 1080) * 100);
  if (resolution < 100) warnings.push('Kısa kenar 1080px altı; platform kalitesi için 1080px önerilir.');

  // Kontrast — gerçek WCAG oranı; metin arka planla arasındaki oran
  const bg = ctx.palette[0];
  const whiteRatio = contrastRatio(bg, '#ffffff');
  const contrastScore = Math.min(100, Math.round((whiteRatio / 7) * 100));
  if (whiteRatio < 4.5) warnings.push('Arka plan ile beyaz metin kontrastı düşük (WCAG AA 4.5:1 altı).');

  // Okunabilirlik — başlık uzunluğu
  const headlineLen = opts.headline.length;
  const readability = headlineLen <= 60 ? 95 : headlineLen <= 110 ? 80 : 60;
  if (headlineLen > 60) warnings.push('Başlık uzun; platformda kısaltılabilir.');

  // Kompozisyon — düzen çeşitliliği bilinen düzenlerden
  const composition = LAYOUTS.includes(opts.layout) ? 90 : 70;

  // Marka uyumu — BrandConsistency sonucu
  const brandConsistency = opts.consistencyScore;

  // Platform uyumu — platform oranı kuralları (bilinen platformlar)
  const platformFit = opts.platform && ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'X', 'YOUTUBE', 'PINTEREST', 'THREADS'].includes(opts.platform) ? 100 : 85;

  const breakdown = { resolution, readability, contrast: contrastScore, composition, brandConsistency, platformFit };
  const overall = Math.round(Object.values(breakdown).reduce((s, v) => s + v, 0) / Object.keys(breakdown).length);
  return { overall, breakdown, warnings };
}

/**
 * AI Stüdyo görsel üretimi — tam zincir (§122):
 * AiImageGeneration → MediaAsset → MasterCreative → Quality → AiGeneration → AiUsage.
 * Kritik olmayan kayıtlarda hata olsa bile üretilen varlık KORUNUR (§107 izolasyon).
 */
export async function generateStudioImages(input: StudioGenerateInput): Promise<StudioCreativeResult[]> {
  const kit = await ensureBrandKit({ workspaceId: input.workspaceId, brandId: input.brandId });
  if (!kit) throw new Error('Marka bulunamadı.');
  const ctx = brandVisualContext(kit);

  const ratio = input.aspectRatio ?? '1:1';
  const { w, h } = ASPECT_SIZES[ratio];
  const count = Math.min(Math.max(input.count ?? 4, 1), 6);
  const provider = imageProviderName();
  const fullPrompt = [input.prompt.trim(), ...ctx.keywords, ...(input.negativePrompt ? [] : ctx.negativeKeywords.map((k) => `-${k}`))]
    .filter(Boolean)
    .join(', ');

  const images = composeLayouts(input, ctx, count);
  const results: StudioCreativeResult[] = [];

  for (const img of images) {
    // 1) AiImageGeneration kaydı
    const generation = await prisma.aiImageGeneration.create({
      data: {
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        userId: input.userId,
        prompt: fullPrompt,
        negativePrompt: input.negativePrompt ?? null,
        style: input.visualStyle ?? null,
        aspectRatio: ratio,
        brandKitUsed: true,
        status: 'RUNNING',
        provider
      }
    });

    try {
      // 2) Depoya yaz + MediaAsset oluştur (orijinal ASLA üzerine yazılmaz — yeni varlık)
      const buf = Buffer.from(img.svg, 'utf8');
      const slugBase = (input.prompt.trim().slice(0, 24) || 'kreatif').toLowerCase().replace(/[^a-z0-9ğüşiöçı]+/gi, '-').replace(/^-+|-+$/g, '') || 'kreatif';
      const filename = `${slugBase}-${img.layout.toLowerCase()}-${ratio.replace(':', 'x')}.svg`;
      const storageKey = makeStorageKey(input.workspaceId, 'ai-studio', filename);
      const stored = await storage().put(storageKey, buf, 'image/svg+xml');
      const hash = hashPrompt(buf.toString('utf8')).slice(0, 32);

      const asset = await prisma.mediaAsset.create({
        data: {
          workspaceId: input.workspaceId,
          brandId: input.brandId,
          kind: 'IMAGE',
          filename,
          originalName: `AI Stüdyo — ${input.prompt.trim().slice(0, 40)}`,
          storageKey,
          publicUrl: stored.publicUrl,
          mimeType: 'image/svg+xml',
          format: 'svg',
          bytes: buf.length,
          width: w,
          height: h,
          aspectRatio: w / h,
          contentHash: hash,
          tags: 'ai-studio',
          status: 'READY',
          createdBy: input.userId
        }
      });

      // 3) Marka tutarlılığı (§70-§71)
      const consistency = checkBrandConsistency({
        brandKit: kit,
        content: { caption: input.prompt, cta: input.cta ?? undefined }
      });

      // 4) Kalite (§68) — şeffaf kırılım
      const quality = evaluateStudioQuality({
        w,
        h,
        layout: img.layout,
        headline: input.headline?.trim() || input.prompt,
        cta: input.cta ?? null,
        ctx,
        consistencyScore: consistency.score
      });

      // 5) MasterCreative + kalite skoru
      const master = await prisma.masterCreative.create({
        data: {
          workspaceId: input.workspaceId,
          brandId: input.brandId,
          title: `${input.prompt.trim().slice(0, 60)} — ${LAYOUT_LABELS[img.layout]}`,
          storageKey,
          fileUrl: stored.publicUrl,
          width: w,
          height: h,
          aspectRatio: ratio,
          layers: JSON.stringify({ layout: img.layout, layoutLabel: LAYOUT_LABELS[img.layout], palette: ctx.palette, headline: input.headline ?? input.prompt, cta: input.cta ?? ctx.preferredCta, subline: ctx.slogan }),
          brandKitVersion: ctx.brandKitVersion,
          createdBy: input.userId,
          quality: {
            create: {
              workspaceId: input.workspaceId,
              brandId: input.brandId,
              resolution: quality.breakdown.resolution,
              readability: quality.breakdown.readability,
              contrast: quality.breakdown.contrast,
              composition: quality.breakdown.composition,
              brandConsistency: quality.breakdown.brandConsistency,
              platformFit: quality.breakdown.platformFit,
              overall: quality.overall,
              details: JSON.stringify({ warnings: quality.warnings })
            }
          }
        }
      });

      await prisma.aiImageGeneration.update({
        where: { id: generation.id },
        data: { status: 'DONE', resultUrl: stored.publicUrl, resultKey: storageKey, costUSD: estimateCost('imageGeneration', 1) }
      });

      // 6) İz + kullanım kayıtları (hatada ana akış bozulmaz)
      await recordGeneration({
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        userId: input.userId,
        type: 'STUDIO_IMAGE',
        provider: 'deterministic',
        platform: null,
        prompt: fullPrompt,
        status: 'SUCCESS',
        durationMs: 0,
        metadata: { studio: true, masterCreativeId: master.id, mediaAssetId: asset.id, layout: img.layout }
      }).catch(() => undefined);
      await trackUsage({
        workspaceId: input.workspaceId,
        userId: input.userId,
        brandId: input.brandId,
        provider,
        service: 'imageGeneration',
        task: 'aiStudio.generate',
        imageCount: 1,
        durationMs: 0,
        costUSD: 0, // yerel motor: maliyet yok (dürüst raporlama)
        meta: { masterCreativeId: master.id, layout: img.layout, estimated: false }
      });

      results.push({
        generationId: generation.id,
        masterId: master.id,
        mediaAssetId: asset.id,
        url: stored.publicUrl,
        width: w,
        height: h,
        aspectRatio: ratio,
        provider,
        quality,
        consistency: { score: consistency.score, gate: consistency.gate, message: consistency.message }
      });
    } catch (error) {
      await prisma.aiImageGeneration.update({
        where: { id: generation.id },
        data: { status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 300) : 'bilinmeyen hata' }
      }).catch(() => undefined);
      logger.warn({ event: 'ai.studio_generation_failed', errorMessage: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  return results;
}


async function upsertVariant(data: {
  workspaceId: string;
  brandId: string;
  masterCreativeId: string;
  platform: string;
  contentType: string;
  aspectRatio: string;
  width: number;
  height: number;
  storageKey: string;
  fileUrl: string;
  layers: string;
}) {
  const existing = await prisma.creativeVariant.findFirst({
    where: {
      masterCreativeId: data.masterCreativeId,
      platform: data.platform,
      contentType: data.contentType,
      aspectRatio: data.aspectRatio
    }
  });
  const payload = {
    storageKey: data.storageKey,
    fileUrl: data.fileUrl,
    width: data.width,
    height: data.height,
    layers: data.layers,
    status: 'READY'
  };
  if (existing) {
    return prisma.creativeVariant.update({ where: { id: existing.id }, data: payload });
  }
  return prisma.creativeVariant.create({
    data: {
      workspaceId: data.workspaceId,
      brandId: data.brandId,
      masterCreativeId: data.masterCreativeId,
      platform: data.platform,
      contentType: data.contentType,
      aspectRatio: data.aspectRatio,
      ...payload
    }
  });
}

/** Akıllı yeniden boyutlandırma (§63): SVG kreatif hedef orana YENİDEN bileştirilir
 *  (esnetme yok); sonuç CreativeVariant kaydıdır, master dokunulmaz. */
export async function resizeMasterCreative(opts: {
  workspaceId: string;
  userId: string;
  masterId: string;
  targets: { platform: string; contentType?: string; aspectRatio: StudioAspectRatio }[];
}) {
  const master = await prisma.masterCreative.findFirst({
    where: { id: opts.masterId, workspaceId: opts.workspaceId }
  });
  if (!master) return null;
  const layers = JSON.parse(master.layers || '{}') as { palette?: string[]; headline?: string; cta?: string; subline?: string };
  const kit = await ensureBrandKit({ workspaceId: opts.workspaceId, brandId: master.brandId });
  const ctx = brandVisualContext(kit ?? {});
  const created = [];

  for (const target of opts.targets) {
    const { w, h } = ASPECT_SIZES[target.aspectRatio];
    const layouts: LayoutName[] = ['CENTERED', 'SPLIT', 'BANNER', 'MINIMAL'];
    const layout = layouts[Math.floor(Math.random() * layouts.length)]; // recompose düzeni
    const svg = renderCreativeSvg({
      w,
      h,
      ctx: { ...ctx, palette: layers.palette ?? ctx.palette },
      layout,
      headline: layers.headline ?? master.title ?? 'Kreatif',
      subline: layers.subline ?? null,
      cta: layers.cta ?? null
    });
    const buf = Buffer.from(svg, 'utf8');
    const filename = `${master.id}-${target.platform.toLowerCase()}-${target.aspectRatio.replace(':', 'x')}.svg`;
    const storageKey = makeStorageKey(opts.workspaceId, 'ai-studio', filename);
    const stored = await storage().put(storageKey, buf, 'image/svg+xml');

    const variant = await upsertVariant({
      workspaceId: opts.workspaceId,
      brandId: master.brandId,
      masterCreativeId: master.id,
      platform: target.platform,
      contentType: target.contentType ?? 'FEED',
      aspectRatio: target.aspectRatio,
      width: w,
      height: h,
      storageKey,
      fileUrl: stored.publicUrl,
      layers: JSON.stringify({ layout, recomposed: true, method: 'DETERMINISTIC_RECOMPOSE' })
    });
    created.push(variant);
  }

  await trackUsage({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    brandId: master.brandId,
    provider: 'deterministic',
    service: 'imageEditing',
    task: 'aiStudio.resize',
    imageCount: created.length,
    meta: { masterId: master.id, estimated: false }
  });

  return created;
}

/** Kontrollü kreatif varyasyonları (§66): başlık/CTA/düzen çeşitlendirmesi. */
export async function createMasterVariations(opts: {
  workspaceId: string;
  userId: string;
  masterId: string;
  styles: string[];
}) {
  const master = await prisma.masterCreative.findFirst({
    where: { id: opts.masterId, workspaceId: opts.workspaceId }
  });
  if (!master) return null;
  const layers = JSON.parse(master.layers || '{}') as { palette?: string[]; headline?: string; cta?: string; subline?: string };
  const kit = await ensureBrandKit({ workspaceId: opts.workspaceId, brandId: master.brandId });
  const ctx = brandVisualContext(kit ?? {});
  const ratio = (master.aspectRatio ?? '1:1') as StudioAspectRatio;
  const { w, h } = ASPECT_SIZES[ratio] ?? ASPECT_SIZES['1:1'];
  const created = [];

  const styleLayout: Record<string, LayoutName> = {
    MINIMAL: 'MINIMAL',
    PREMIUM: 'CENTERED',
    SALES: 'BANNER',
    PRODUCT_FOCUSED: 'SPLIT',
    CORPORATE: 'MINIMAL',
    MODERN: 'SPLIT',
    EYE_CATCHING: 'BANNER'
  };

  for (const style of opts.styles.slice(0, 6)) {
    const layout = styleLayout[style] ?? 'CENTERED';
    const headlineVariants = [layers.headline ?? master.title ?? 'Kreatif'];
    if (style === 'SALES') headlineVariants[0] = `${headlineVariants[0]} — keşfet`;
    if (style === 'EYE_CATCHING') headlineVariants[0] = headlineVariants[0].toUpperCase();
    const svg = renderCreativeSvg({
      w,
      h,
      ctx: { ...ctx, palette: layers.palette ?? ctx.palette },
      layout,
      headline: headlineVariants[0],
      subline: layers.subline ?? null,
      cta: layers.cta ?? null
    });
    const buf = Buffer.from(svg, 'utf8');
    const filename = `${master.id}-var-${style.toLowerCase()}.svg`;
    const storageKey = makeStorageKey(opts.workspaceId, 'ai-studio', filename);
    const stored = await storage().put(storageKey, buf, 'image/svg+xml');
    // Varyasyon yeni bir master altında CreativeVariant olarak değil, master'ın
    // CreativeVariant'ı olarak kaydedilir (kaynak koruması §67).
    const variant = await upsertVariant({
      workspaceId: opts.workspaceId,
      brandId: master.brandId,
      masterCreativeId: master.id,
      platform: `VARIATION_${style}`,
      contentType: 'FEED',
      aspectRatio: ratio,
      width: w,
      height: h,
      storageKey,
      fileUrl: stored.publicUrl,
      layers: JSON.stringify({ layout, style, variationOf: master.id })
    });
    created.push(variant);
  }

  await trackUsage({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    brandId: master.brandId,
    provider: 'deterministic',
    service: 'imageEditing',
    task: 'aiStudio.variations',
    imageCount: created.length,
    meta: { masterId: master.id, estimated: false }
  });

  return created;
}

/** Stüdyo geçmişi (master + varyant sayısı) — çalışma alanına özgü. */
export async function listMasters(workspaceId: string, brandId?: string | null, take = 30) {
  return prisma.masterCreative.findMany({
    where: { workspaceId, ...(brandId ? { brandId } : {}) },
    orderBy: { createdAt: 'desc' },
    take,
    include: { variants: true, quality: true }
  });
}
