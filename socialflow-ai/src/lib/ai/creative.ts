/**
 * PHASE 4 — AI Kreatif Servisleri (§56-§67)
 * ------------------------------------------
 * - AiImageGenerationService (brand-aware)
 * - Generative background / expand
 * - SmartCreativeResizeService
 * - CreativeVariationService
 * Her servis marka kiti bağlamını otomatik enjekte eder ve ürün görselini korur.
 */

export interface GenerateImageInput {
  brandId: string;
  brandKit?: any;
  campaignId?: string | null;
  productId?: string | null;
  platform?: string | null;
  prompt: string;
  visualStyle?: string | null;
  aspectRatio?: string; // 1:1 | 4:5 | 9:16 | 16:9
  referenceImageUrl?: string | null;
  keepProductImage?: boolean;
}

export interface GeneratedImage {
  id: string;
  prompt: string;
  url: string;
  width: number;
  height: number;
  aspectRatio: string;
  brandKitUsed: boolean;
}

// Deterministic mock — gerçekte AiProviderAdapter üzerinden OpenAI / stability çağırır.
export async function generateImages(input: GenerateImageInput, count = 4): Promise<GeneratedImage[]> {
  const ratio = input.aspectRatio ?? '1:1';
  const [w, h] = ratioToSize(ratio);
  const palette = (input.brandKit?.colors ?? []).filter((c: any) => !c.prohibited).map((c: any) => c.hex).join(', ') || '#6D28D9';
  // Brand safety: ürün görseli korunacaksa prompt'a eklenir
  const safetyNote = input.keepProductImage ? ' (ürün görseli korunarak)' : '';
  return Array.from({ length: count }, (_, i) => ({
    id: `gen-${Date.now()}-${i}`,
    prompt: `${input.prompt}${safetyNote} — Palette: ${palette}`,
    url: `/demo/demo-${(i % 5) + 1}-${ratioToFileSuffix(ratio)}.jpg`,
    width: w,
    height: h,
    aspectRatio: ratio,
    brandKitUsed: !!input.brandKit,
  }));
}

function ratioToSize(ratio: string): [number, number] {
  switch (ratio) {
    case '4:5':
      return [1080, 1350];
    case '9:16':
      return [1080, 1920];
    case '16:9':
      return [1920, 1080];
    case '1:1':
    default:
      return [1080, 1080];
  }
}
function ratioToFileSuffix(ratio: string): string {
  switch (ratio) {
    case '4:5':
      return 'portrait';
    case '9:16':
      return 'story';
    case '16:9':
      return 'landscape';
    default:
      return 'square';
  }
}

// Smart resize: katmanları (logo, headline, product, CTA) hedef orana recompose eder.
export interface ResizeInput {
  master: { storageKey: string; width: number; height: number; layers?: any };
  targets: { platform: string; contentType: string; aspectRatio: string }[];
}

export async function smartResize(input: ResizeInput): Promise<{ platform: string; aspectRatio: string; storageKey: string; width: number; height: number }[]> {
  return input.targets.map((t) => {
    const [w, h] = ratioToSize(t.aspectRatio);
    return { platform: t.platform, aspectRatio: t.aspectRatio, storageKey: `${input.master.storageKey}#${t.aspectRatio}`, width: w, height: h };
  });
}

// Creative variations — stil seçenekleri
export type VariationStyle = 'MINIMAL' | 'PREMIUM' | 'SALES' | 'PRODUCT_FOCUSED' | 'CORPORATE' | 'MODERN' | 'EYE_CATCHING';
export const VARIATION_STYLE_LABELS: Record<VariationStyle, string> = {
  MINIMAL: 'Minimal',
  PREMIUM: 'Premium',
  SALES: 'Satış Odaklı',
  PRODUCT_FOCUSED: 'Ürün Odaklı',
  CORPORATE: 'Kurumsal',
  MODERN: 'Modern',
  EYE_CATCHING: 'Dikkat Çekici',
};

export async function generateVariations(master: { id: string; storageKey: string }, count: 4, style?: VariationStyle): Promise<{ id: string; url: string; style: VariationStyle }[]> {
  const styles: VariationStyle[] = ['MINIMAL', 'PREMIUM', 'SALES', 'PRODUCT_FOCUSED', 'MODERN', 'CORPORATE', 'EYE_CATCHING'];
  const chosen = style ? [style] : styles.slice(0, count);
  return chosen.slice(0, count).map((s, i) => ({
    id: `var-${Date.now()}-${i}`,
    url: `/demo/demo-${(i % 5) + 1}-square.jpg`,
    style: s,
  }));
}

export const STUDIO_TABS = [
  { id: 'generate', label: 'Görsel Oluştur', icon: 'sparkles' },
  { id: 'edit', label: 'Görsel Düzenle', icon: 'magic' },
  { id: 'expand', label: 'Görseli Genişlet', icon: 'maximize' },
  { id: 'background', label: 'Arka Plan', icon: 'image' },
  { id: 'remove', label: 'Nesne Sil', icon: 'trash' },
  { id: 'replace', label: 'Nesne Değiştir', icon: 'refresh' },
  { id: 'variations', label: 'Varyasyon', icon: 'layers' },
  { id: 'resize', label: 'Platformlara Uyarla', icon: 'monitor' },
  { id: 'video', label: 'Video Dönüştür', icon: 'video' },
] as const;
