import type { FocalPoint, MediaVariant } from './types';

/**
 * Medya Motoru (Media Auto Resize Engine) — istemci tarafı canvas uygulaması.
 * ---------------------------------------------------------------------------
 * Prensipler:
 *  - Orijinal master medya ASLA değiştirilmez; her hedef için ayrı varyant
 *    üretilir ve sunucuya gönderilir.
 *  - Görsel körlemesine ESNETİLMEZ. Ya akıllı kırpma (smart crop) ya da
 *    "fit" modunda bulanık arka plan dolgusu kullanılır.
 *  - Odak noktası; kenar yoğunluğu, ten rengi ve parlaklık dağılımından
 *    hesaplanır. Kullanıcı elle kaydırarak geçersiz kılabilir.
 *  - Sunucu tarafında keskin/yeniden örnekleme gerekirse aynı arayüzle
 *    `sharp` tabanlı bir MediaProcessingJob devreye alınabilir.
 */

export const RATIO_PRESETS: Record<string, number> = {
  '1:1': 1,
  '4:5': 0.8,
  '5:4': 1.25,
  '9:16': 0.5625,
  '16:9': 1.7778,
  '2:3': 0.6667,
  '3:2': 1.5,
  '4:3': 1.3333,
  '3:4': 0.75,
  '1.91:1': 1.91,
  '21:9': 2.3333
};

export function ratioValue(ratio: string): number {
  if (RATIO_PRESETS[ratio] !== undefined) return RATIO_PRESETS[ratio];
  const [a, b] = ratio.split(':').map(Number);
  return a && b ? a / b : 1;
}

export interface TargetSizeConstraints {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

/** Hedef oran için, kısıtlara uyan en büyük çıktı boyutunu hesaplar. */
export function computeTargetSize(ratio: string, c: TargetSizeConstraints): { width: number; height: number } {
  const r = ratioValue(ratio);
  // Önce minimumları karşıla
  let width = c.minWidth;
  let height = Math.round(width / r);
  if (height < c.minHeight) {
    height = c.minHeight;
    width = Math.round(height * r);
  }
  // Maksimumları aşma
  if (width > c.maxWidth) {
    width = c.maxWidth;
    height = Math.round(width / r);
  }
  if (height > c.maxHeight) {
    height = c.maxHeight;
    width = Math.round(height * r);
  }
  // Çift sayıya yuvarla (video codec uyumluluğu)
  width -= width % 2;
  height -= height % 2;
  return { width, height };
}

// ---------------------------------------------------------------------------
// Odak noktası tespiti
// ---------------------------------------------------------------------------

export interface DetectOptions {
  sampleSize?: number;
}

/**
 * Otomatik odak noktası. Üretimde gerçek bir yüz/nesne tespiti modeli
 * (ör. MediaPipe Face Detection, AWS Rekognition) buraya takılabilir;
 * arayüz değişmez, yalnızca `method` alanı güncellenir.
 *
 * Kullanılan sezgiseller:
 *  1. Kenar yoğunluğu (Sobel benzeri gradyan büyüklüğü) — detay nerede?
 *  2. Ten rengi olasılığı — yüz/insan nerede?
 *  3. Merkez ağırlıklı Gauss — fotoğrafçılık kompozisyon önyargısı
 */
export async function detectFocalPoint(source: CanvasImageSource, width: number, height: number, opts: DetectOptions = {}): Promise<FocalPoint> {
  const sample = opts.sampleSize ?? 96;
  const canvas = document.createElement('canvas');
  canvas.width = sample;
  canvas.height = sample;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { x: 0.5, y: 0.5, method: 'CENTER' };

  ctx.drawImage(source, 0, 0, sample, sample);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, sample, sample).data;
  } catch {
    // CORS nedeniyle piksel okunamıyorsa merkeze düş
    return { x: 0.5, y: 0.45, method: 'CENTER' };
  }

  const gray = new Float32Array(sample * sample);
  const skin = new Float32Array(sample * sample);
  for (let i = 0; i < sample * sample; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    // Basit ten rengi kuralı (RGB uzayı)
    const isSkin =
      r > 60 && g > 35 && b > 20 && r > g && r > b && Math.max(r, g, b) - Math.min(r, g, b) > 12 && Math.abs(r - g) > 8;
    skin[i] = isSkin ? 1 : 0;
  }

  // Gradyan büyüklüğü
  const edge = new Float32Array(sample * sample);
  for (let y = 1; y < sample - 1; y++) {
    for (let x = 1; x < sample - 1; x++) {
      const i = y * sample + x;
      const gx =
        -gray[i - sample - 1] + gray[i - sample + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + sample - 1] + gray[i + sample + 1];
      const gy =
        -gray[i - sample - 1] - 2 * gray[i - sample] - gray[i - sample + 1] + gray[i + sample - 1] + 2 * gray[i + sample] + gray[i + sample + 1];
      edge[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Ağırlık haritası: kenar + ten + merkez önyargısı
  let sumX = 0;
  let sumY = 0;
  let sumW = 0;
  for (let y = 0; y < sample; y++) {
    for (let x = 0; x < sample; x++) {
      const i = y * sample + x;
      const nx = (x + 0.5) / sample;
      const ny = (y + 0.5) / sample;
      const centerBias = Math.exp(-((nx - 0.5) ** 2 + (ny - 0.45) ** 2) * 3.2);
      const w = (edge[i] / 255) * 1.0 + skin[i] * 0.9 + centerBias * 0.35;
      sumX += nx * w;
      sumY += ny * w;
      sumW += w;
    }
  }

  const x = sumW > 0 ? sumX / sumW : 0.5;
  const y = sumW > 0 ? sumY / sumW : 0.45;
  const skinRatio = skin.reduce((a, b) => a + b, 0) / (sample * sample);

  return {
    x: clamp(x, 0.05, 0.95),
    y: clamp(y, 0.05, 0.95),
    method: skinRatio > 0.06 ? 'FACE' : 'SUBJECT',
    confidence: Number(clamp(skinRatio * 3 + 0.4, 0, 1).toFixed(2))
  };
}

// ---------------------------------------------------------------------------
// Akıllı kırpma
// ---------------------------------------------------------------------------

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Kaynak içinde, hedef orana uyan EN BÜYÜK kırpma kutusunu odak noktasına
 * göre konumlandırır. "cover" davranışı: kaynak tamamen doldurulur, taşan
 * kenarlar kırpılır. Görsel asla esnetilmez.
 */
export function computeSmartCrop(
  srcW: number,
  srcH: number,
  targetRatio: number,
  focal: FocalPoint = { x: 0.5, y: 0.5 },
  manualOffset?: { x: number; y: number } | null
): CropRect {
  const srcRatio = srcW / srcH;
  let cropW: number;
  let cropH: number;

  if (srcRatio > targetRatio) {
    // Kaynak daha geniş → yüksekliği koru, genişlikten kırp
    cropH = srcH;
    cropW = srcH * targetRatio;
  } else {
    // Kaynak daha uzun → genişliği koru, yükseklikten kırp
    cropW = srcW;
    cropH = srcW / targetRatio;
  }

  const offsetX = manualOffset?.x ?? 0;
  const offsetY = manualOffset?.y ?? 0;

  const fx = (focal.x ?? 0.5) * srcW + offsetX * (srcW - cropW);
  const fy = (focal.y ?? 0.5) * srcH + offsetY * (srcH - cropH);

  const x = clamp(fx - cropW / 2, 0, Math.max(0, srcW - cropW));
  const y = clamp(fy - cropH / 2, 0, Math.max(0, srcH - cropH));

  return { x, y, w: cropW, h: cropH };
}

/** "fit" modu: kırpma yok, bulanık arka plan üzerine ortalanmış görsel. */
export function computeFitRect(srcW: number, srcH: number, outW: number, outH: number): CropRect & { dx: number; dy: number; dw: number; dh: number } {
  const scale = Math.min(outW / srcW, outH / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  return { x: 0, y: 0, w: srcW, h: srcH, dx: (outW - dw) / 2, dy: (outH - dh) / 2, dw, dh };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export interface LayerBase {
  id: string;
  type: 'TEXT' | 'LOGO' | 'SHAPE' | 'OVERLAY';
  x: number; // 0..1
  y: number; // 0..1
  width?: number; // 0..1
  height?: number; // 0..1
  rotation?: number;
  opacity?: number;
  visible?: boolean;
}

export interface TextLayer extends LayerBase {
  type: 'TEXT';
  text: string;
  fontSize?: number; // oransal (çıktı yüksekliğine göre)
  color?: string;
  background?: string;
  align?: 'left' | 'center' | 'right';
  fontWeight?: number;
  fontFamily?: string;
  padding?: number;
  radius?: number;
}

export interface LogoLayer extends LayerBase {
  type: 'LOGO';
  src: string; // data URL veya public URL
}

export interface ShapeLayer extends LayerBase {
  type: 'SHAPE';
  shape: 'rect' | 'circle';
  fill?: string;
  radius?: number;
}

export interface OverlayLayer extends LayerBase {
  type: 'OVERLAY';
  color?: string; // ör. rgba(0,0,0,0.35)
  gradient?: { from: string; to: string; direction?: 'vertical' | 'horizontal' };
}

export type Layer = TextLayer | LogoLayer | ShapeLayer | OverlayLayer;

export interface MediaEdits {
  rotate?: number; // derece
  zoom?: number; // 1 = %100
  brightness?: number; // 100 = normal
  contrast?: number;
  saturation?: number;
  blur?: number; // px
  background?: 'BLUR' | 'COLOR' | 'TRANSPARENT';
  backgroundColor?: string;
  layers?: Layer[];
  manualOffset?: { x: number; y: number } | null;
  cropMode?: 'SMART' | 'MANUAL' | 'FIT' | 'AI_EXTEND';
  extendPrompt?: string;
}

export interface RenderInput {
  source: CanvasImageSource;
  sourceWidth: number;
  sourceHeight: number;
  targetRatio: number;
  targetWidth: number;
  targetHeight: number;
  focalPoint?: FocalPoint | null;
  edits?: MediaEdits | null;
  mimeType?: string;
  quality?: number;
  /** Güvenli alan kılavuzlarını yakmak için (yalnızca önizleme). */
  drawSafeArea?: { top: number; bottom: number; left: number; right: number } | null;
}

export interface RenderOutput {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  crop: CropRect | null;
  method: MediaVariant['method'];
}

export function cssFilterFromEdits(e: MediaEdits | null | undefined): string {
  if (!e) return 'none';
  const parts: string[] = [];
  if (e.brightness && e.brightness !== 100) parts.push(`brightness(${e.brightness}%)`);
  if (e.contrast && e.contrast !== 100) parts.push(`contrast(${e.contrast}%)`);
  if (e.saturation && e.saturation !== 100) parts.push(`saturate(${e.saturation}%)`);
  if (e.blur) parts.push(`blur(${e.blur}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

/** Varyantı canvas üzerinde üretir. Orijinal dosyaya dokunmaz. */
export async function renderVariant(input: RenderInput): Promise<RenderOutput> {
  const {
    source,
    sourceWidth,
    sourceHeight,
    targetRatio,
    targetWidth,
    targetHeight,
    focalPoint,
    edits,
    mimeType = 'image/jpeg',
    quality = 0.9
  } = input;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas bağlamı oluşturulamadı.');
  ctx.imageSmoothingQuality = 'high';

  const mode = edits?.cropMode ?? 'SMART';
  const rotation = ((edits?.rotate ?? 0) % 360 + 360) % 360;
  const zoom = Math.max(0.2, edits?.zoom ?? 1);

  // Arka plan
  if (edits?.background === 'COLOR' && edits.backgroundColor) {
    ctx.fillStyle = edits.backgroundColor;
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  } else if (edits?.background === 'BLUR') {
    // Bulanık dolgu: tüm görseli kaplayacak şekilde çiz + blur
    ctx.save();
    ctx.filter = 'blur(' + Math.max(18, Math.round(targetWidth / 28)) + 'px) brightness(92%)';
    const cov = computeSmartCrop(sourceWidth, sourceHeight, targetRatio, { x: 0.5, y: 0.5 });
    ctx.drawImage(source, cov.x, cov.y, cov.w, cov.h, -20, -20, targetWidth + 40, targetHeight + 40);
    ctx.restore();
  } else if (mimeType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  let cropRect: CropRect | null = null;
  let method: MediaVariant['method'] = 'SMART_CROP';

  ctx.save();
  ctx.filter = cssFilterFromEdits(edits);

  if (mode === 'FIT') {
    method = 'FIT';
    const fit = computeFitRect(sourceWidth, sourceHeight, targetWidth, targetHeight);
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, fit.dx, fit.dy, fit.dw, fit.dh);
  } else {
    const effectiveRatio = targetRatio / zoom;
    cropRect = computeSmartCrop(sourceWidth, sourceHeight, effectiveRatio, focalPoint ?? { x: 0.5, y: 0.5 }, edits?.manualOffset);

    if (rotation === 90 || rotation === 270) {
      ctx.translate(targetWidth / 2, targetHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(source, cropRect.x, cropRect.y, cropRect.w, cropRect.h, -targetHeight / 2, -targetWidth / 2, targetHeight, targetWidth);
    } else {
      if (rotation === 180) {
        ctx.translate(targetWidth, targetHeight);
        ctx.rotate(Math.PI);
      }
      ctx.drawImage(source, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, targetWidth, targetHeight);
    }
    if (mode === 'MANUAL') method = 'MANUAL';
    if (mode === 'AI_EXTEND') method = 'AI_EXTEND';
  }
  ctx.restore();

  // Katmanlar
  if (edits?.layers?.length) {
    await drawLayers(ctx, edits.layers, targetWidth, targetHeight);
  }

  // Güvenli alan kılavuzu (yalnızca önizleme için yakılır)
  if (input.drawSafeArea) {
    drawSafeAreaGuide(ctx, input.drawSafeArea, targetWidth, targetHeight);
  }

  const blob = await canvasToBlob(canvas, mimeType, quality);
  const dataUrl = await blobToDataUrl(blob);
  return {
    blob,
    dataUrl,
    width: targetWidth,
    height: targetHeight,
    bytes: blob.size,
    crop: cropRect,
    method
  };
}

async function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], w: number, h: number) {
  for (const layer of layers) {
    if (layer.visible === false) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1;

    const cx = layer.x * w;
    const cy = layer.y * h;
    if (layer.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    if (layer.type === 'OVERLAY') {
      const lw = (layer.width ?? 1) * w;
      const lh = (layer.height ?? 1) * h;
      if (layer.gradient) {
        const grad =
          layer.gradient.direction === 'horizontal'
            ? ctx.createLinearGradient(cx - lw / 2, cy, cx + lw / 2, cy)
            : ctx.createLinearGradient(cx, cy - lh / 2, cx, cy + lh / 2);
        grad.addColorStop(0, layer.gradient.from);
        grad.addColorStop(1, layer.gradient.to);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = layer.color ?? 'rgba(0,0,0,0.35)';
      }
      ctx.fillRect(cx - lw / 2, cy - lh / 2, lw, lh);
    }

    if (layer.type === 'SHAPE') {
      const lw = (layer.width ?? 0.3) * w;
      const lh = (layer.height ?? 0.1) * h;
      ctx.fillStyle = layer.fill ?? 'rgba(255,255,255,0.9)';
      if (layer.shape === 'circle') {
        ctx.beginPath();
        ctx.ellipse(cx, cy, lw / 2, lh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        roundRect(ctx, cx - lw / 2, cy - lh / 2, lw, lh, (layer.radius ?? 0.1) * Math.min(lw, lh));
        ctx.fill();
      }
    }

    if (layer.type === 'TEXT') {
      const fontSize = Math.round((layer.fontSize ?? 0.055) * h);
      const weight = layer.fontWeight ?? 700;
      const family = layer.fontFamily ?? 'Inter, system-ui, sans-serif';
      ctx.font = `${weight} ${fontSize}px ${family}`;
      ctx.textAlign = (layer.align ?? 'center') as CanvasTextAlign;
      ctx.textBaseline = 'middle';

      const maxWidth = (layer.width ?? 0.8) * w;
      const lines = wrapText(ctx, layer.text, maxWidth);
      const lineHeight = fontSize * 1.25;
      const blockHeight = lines.length * lineHeight;
      const pad = (layer.padding ?? 0.5) * fontSize;

      if (layer.background) {
        let widest = 0;
        for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
        const bx = layer.align === 'left' ? cx - pad : cx - widest / 2 - pad;
        ctx.fillStyle = layer.background;
        roundRect(ctx, bx, cy - blockHeight / 2 - pad * 0.6, widest + pad * 2, blockHeight + pad * 1.2, (layer.radius ?? 0.25) * fontSize);
        ctx.fill();
      }

      ctx.fillStyle = layer.color ?? '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = fontSize * 0.12;
      lines.forEach((line, i) => {
        const ly = cy - blockHeight / 2 + lineHeight * (i + 0.5);
        const lx = layer.align === 'left' ? cx : layer.align === 'right' ? cx : cx;
        ctx.fillText(line, lx, ly);
      });
      ctx.shadowBlur = 0;
    }

    if (layer.type === 'LOGO') {
      const img = await loadImage(layer.src);
      const lw = (layer.width ?? 0.18) * w;
      const scale = lw / img.naturalWidth;
      const lh = img.naturalHeight * scale;
      ctx.drawImage(img, cx - lw / 2, cy - lh / 2, lw, lh);
    }

    ctx.restore();
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = String(text ?? '').split('\n');
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawSafeAreaGuide(
  ctx: CanvasRenderingContext2D,
  area: { top: number; bottom: number; left: number; right: number },
  w: number,
  h: number
) {
  ctx.save();
  // Dış bölgeyi hafif karart
  ctx.fillStyle = 'rgba(255,59,48,0.16)';
  ctx.fillRect(0, 0, w, h * area.top);
  ctx.fillRect(0, h * (1 - area.bottom), w, h * area.bottom);
  ctx.fillRect(0, h * area.top, w * area.left, h * (1 - area.top - area.bottom));
  ctx.fillRect(w * (1 - area.right), h * area.top, w * area.right, h * (1 - area.top - area.bottom));

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = Math.max(2, w * 0.004);
  ctx.strokeRect(w * area.left, h * area.top, w * (1 - area.left - area.right), h * (1 - area.top - area.bottom));
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Görsel yüklenemedi.'));
    img.src = src;
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Görsel dönüştürülemedi.'))),
      mimeType,
      quality
    );
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Dosya okunamadı.'));
    r.readAsDataURL(blob);
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

/** Dosyadan görsel/video meta verisi çıkarır. */
export async function readMediaMeta(file: File): Promise<{
  width: number | null;
  height: number | null;
  durationMs: number | null;
  dataUrl: string;
}> {
  const dataUrl = await fileToDataUrl(file);
  if (file.type.startsWith('image/')) {
    const img = await loadImage(dataUrl);
    return { width: img.naturalWidth, height: img.naturalHeight, durationMs: null, dataUrl };
  }
  if (file.type.startsWith('video/')) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null,
          dataUrl
        });
      };
      video.onerror = () => resolve({ width: null, height: null, durationMs: null, dataUrl });
      video.src = dataUrl;
    });
  }
  return { width: null, height: null, durationMs: null, dataUrl };
}

export async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
