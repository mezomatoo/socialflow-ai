import type { PlatformRuleView } from '../rules/ruleEngine';
import type { ContentType, PlatformCode } from '../platforms/platforms';
import { PLATFORM_META } from '../platforms/platforms';
import { formatBytes } from '../format';
import type { MediaIssue } from './types';

/**
 * Medya doğrulama — kural motoruna karşı.
 * "Görsel çözünürlüğü Instagram gönderisi için düşük olabilir." gibi
 * anlaşılır Türkçe uyarılar üretir.
 */

export interface MediaMeta {
  kind: 'IMAGE' | 'VIDEO';
  mimeType: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs?: number | null;
}

export function validateMediaForRule(
  media: MediaMeta | null | undefined,
  rule: PlatformRuleView
): MediaIssue[] {
  const issues: MediaIssue[] = [];
  const where = { platform: rule.platform as PlatformCode, contentType: rule.contentType as ContentType };
  const pName = PLATFORM_META[rule.platform as PlatformCode]?.name ?? rule.platform;

  const requiresVideo = ['REEL', 'SHORTS', 'VIDEO'].includes(rule.contentType) || rule.supportedMimeTypes.every((m) => m.startsWith('video/'));
  const requiresImage = rule.contentType === 'PIN' || rule.contentType === 'LOCAL_POST';

  if (!media) {
    if (requiresVideo || requiresImage) {
      issues.push({
        level: 'ERROR',
        code: 'MEDIA_REQUIRED',
        message: `${rule.label} için medya yüklenmesi gerekiyor.`,
        ...where
      });
    }
    return issues;
  }

  // Tür kontrolü
  if (requiresVideo && media.kind !== 'VIDEO') {
    issues.push({
      level: 'ERROR',
      code: 'VIDEO_REQUIRED',
      message: `${rule.label} yalnızca video kabul ediyor. Lütfen bir video seçin.`,
      suggestion: 'Görsel yerine video yükleyin veya bu hedefi kaldırın.',
      ...where
    });
  }
  if (media.kind === 'VIDEO' && !rule.supportedMimeTypes.some((m) => m.startsWith('video/'))) {
    issues.push({
      level: 'ERROR',
      code: 'VIDEO_NOT_SUPPORTED',
      message: `${rule.label} video desteklemiyor.`,
      ...where
    });
  }
  if (media.kind === 'IMAGE' && !rule.supportedMimeTypes.some((m) => m.startsWith('image/'))) {
    issues.push({
      level: 'ERROR',
      code: 'IMAGE_NOT_SUPPORTED',
      message: `${rule.label} görsel desteklemiyor.`,
      ...where
    });
  }

  // MIME / format
  if (rule.supportedMimeTypes.length && !rule.supportedMimeTypes.includes(media.mimeType)) {
    issues.push({
      level: 'ERROR',
      code: 'MIME_UNSUPPORTED',
      message: `${pName} bu dosya biçimini desteklemiyor (${media.format.toUpperCase()}).`,
      suggestion: `Desteklenen biçimler: ${rule.supportedMimeTypes.join(', ')}`,
      ...where
    });
  }

  // Dosya boyutu
  const maxBytes = media.kind === 'VIDEO' ? rule.maxVideoFileSize ?? rule.maxFileSize : rule.maxFileSize;
  if (media.bytes > maxBytes) {
    issues.push({
      level: 'ERROR',
      code: 'FILE_TOO_LARGE',
      message: `Bu ${media.kind === 'VIDEO' ? 'video' : 'görsel'} seçilen platformun maksimum dosya boyutunu aşıyor. (${formatBytes(
        media.bytes
      )} / ${formatBytes(maxBytes)})`,
      suggestion: media.kind === 'VIDEO' ? 'Videoyu daha düşük bit hızında dışa aktarın.' : 'Görseli sıkıştırın veya daha küçük boyutta yükleyin.',
      ...where
    });
  }

  // Çözünürlük
  if (media.width && media.height) {
    if (media.width < rule.minWidth || media.height < rule.minHeight) {
      issues.push({
        level: media.width < rule.minWidth * 0.75 ? 'ERROR' : 'WARNING',
        code: 'RESOLUTION_LOW',
        message: `Görsel çözünürlüğü ${pName} ${labelOfType(rule.contentType)} için düşük olabilir. (${media.width}×${media.height}, önerilen en az ${rule.minWidth}×${rule.minHeight})`,
        suggestion: 'Daha yüksek çözünürlüklü bir kaynak kullanın; düşük çözünürlük büyütüldüğünde kalite kaybı olur.',
        ...where
      });
    }
    if (media.width > rule.maxWidth || media.height > rule.maxHeight) {
      issues.push({
        level: 'INFO',
        code: 'RESOLUTION_HIGH',
        message: `Kaynak çözünürlük ${rule.maxWidth}×${rule.maxHeight} üzerinde; yükleme sırasında otomatik olarak küçültülecek.`,
        ...where
      });
    }

    // En-boy oranı
    const ratio = media.width / media.height;
    const supported = rule.supportedAspectRatios.map(ratioValue);
    const closest = supported.reduce((best, v) => (Math.abs(v - ratio) < Math.abs(best - ratio) ? v : best), supported[0] ?? 1);
    const drift = Math.abs(closest - ratio) / closest;

    if (!rule.supportedAspectRatios.includes(exactRatio(media.width, media.height)) && drift > 0.02) {
      issues.push({
        level: drift > 0.25 ? 'WARNING' : 'INFO',
        code: 'RATIO_MISMATCH',
        message:
          drift > 0.25
            ? `Kaynak oranı ${rule.label} için uygun değil. Akıllı kırpma ile ${rule.recommendedAspectRatio} oranına dönüştürülecek.`
            : `${rule.label} için ${rule.recommendedAspectRatio} oranında kırpma uygulanacak.`,
        suggestion: drift > 0.4 ? 'Kırpma yerine "AI ile Görseli Genişlet" seçeneğini değerlendirebilirsiniz.' : undefined,
        ...where
      });
    }
  }

  // Video süresi
  if (media.kind === 'VIDEO' && media.durationMs != null) {
    const secs = media.durationMs / 1000;
    if (rule.maxVideoDuration && secs > rule.maxVideoDuration) {
      issues.push({
        level: 'ERROR',
        code: 'VIDEO_TOO_LONG',
        message: `Video süresi ${Math.round(secs)} sn, ancak ${pName} ${labelOfType(rule.contentType)} için en fazla ${rule.maxVideoDuration} sn olabilir.`,
        suggestion: 'Videoyu kısaltın veya daha uzun formatı destekleyen bir platform seçin.',
        ...where
      });
    }
    if (rule.minVideoDuration && secs < rule.minVideoDuration) {
      issues.push({
        level: 'ERROR',
        code: 'VIDEO_TOO_SHORT',
        message: `Video süresi ${Math.round(secs)} sn, ancak en az ${rule.minVideoDuration} sn olmalıdır.`,
        ...where
      });
    }
  }

  return issues;
}

export function labelOfType(t: string): string {
  const map: Record<string, string> = {
    FEED: 'gönderisi',
    STORY: 'hikayesi',
    REEL: 'Reels',
    SHORTS: 'Shorts',
    POST: 'gönderisi',
    VIDEO: 'videosu',
    PIN: 'Pin',
    LOCAL_POST: 'gönderisi',
    PROFILE_POST: 'gönderisi'
  };
  return map[t] ?? 'içeriği';
}

function ratioValue(r: string): number {
  const [a, b] = r.split(':').map(Number);
  return a && b ? a / b : 1;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function exactRatio(w: number, h: number): string {
  if (!w || !h) return '1:1';
  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  if (rw <= 40 && rh <= 40) return `${rw}:${rh}`;
  return (w / h).toFixed(2) + ':1';
}

/**
 * Güvenli alan kontrolü: önemli öğeler (logo/metin/yüz) platform arayüzünün
 * kapladığı bölgelerde kalıyor mu?
 */
export function checkSafeArea(
  rule: PlatformRuleView,
  importantRegions: { x: number; y: number; w: number; h: number; label?: string }[] = []
): MediaIssue[] {
  if (!rule.safeArea) return [];
  const { top, bottom, left, right } = rule.safeArea;
  const issues: MediaIssue[] = [];
  const safe = { x: left, y: top, w: 1 - left - right, h: 1 - top - bottom };

  for (const r of importantRegions) {
    const outside =
      r.x < safe.x - 0.001 ||
      r.y < safe.y - 0.001 ||
      r.x + r.w > safe.x + safe.w + 0.001 ||
      r.y + r.h > safe.y + safe.h + 0.001;
    if (outside) {
      issues.push({
        level: 'WARNING',
        code: 'SAFE_AREA',
        message: `${r.label ?? 'Önemli öğe'} ${rule.label} güvenli alanının dışında kalıyor. Platform arayüzü bu bölümü kapatabilir.`,
        suggestion: 'Öğeyi ortaya doğru taşıyın veya odak noktasını yeniden konumlandırın.',
        platform: rule.platform as PlatformCode,
        contentType: rule.contentType as ContentType
      });
    }
  }
  return issues;
}
