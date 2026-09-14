import { PLATFORM_META, type ContentType, type PlatformCode } from '../platforms/platforms';
import type { PlatformRuleView } from '../rules/ruleEngine';
import { charLength, weightedLength } from '../text';
import { formatBytes } from '../format';
import { toFriendlyError, safeProviderMessage } from './errors';
import type {
  AccountProfile,
  AnalyticsResult,
  CaptionValidationResult,
  MediaValidationInput,
  MediaValidationResult,
  PostStatusResult,
  PublishPayload,
  PublishResult,
  SocialProvider,
  TokenSet
} from './types';

/**
 * BaseSocialProvider — tüm platform adaptörlerinin ortak tabanı.
 * Ortak işler:
 *  - Kural motoruna dayalı medya/açıklama doğrulaması
 *  - Hata eşleme (ham sağlayıcı hatası → Türkçe anlaşılır mesaj)
 *  - HTTP yardımcıları, token yenileme kancası
 *  - Zamanlama (schedulePost) için varsayılan davranış
 */
export abstract class BaseSocialProvider implements SocialProvider {
  abstract readonly platform: PlatformCode;
  readonly apiVersion: string;

  protected constructor(apiVersion = 'v1') {
    this.apiVersion = apiVersion;
  }

  get label(): string {
    return PLATFORM_META[this.platform]?.name ?? this.platform;
  }

  // --- OAuth (alt sınıflar doldurur) --------------------------------------
  abstract getAuthorizationUrl(params: {
    state: string;
    redirectUri: string;
    codeVerifier?: string;
    scopes?: string[];
  }): string;

  abstract exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<TokenSet>;

  abstract refreshToken(token: { accessToken: string; refreshToken?: string | null }): Promise<TokenSet>;

  abstract fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]>;

  abstract validateToken(accessToken: string): Promise<{ valid: boolean; message?: string }>;

  // --- Yayınlama -----------------------------------------------------------
  abstract publishPost(payload: PublishPayload): Promise<PublishResult>;

  async publishStory(payload: PublishPayload): Promise<PublishResult> {
    return this.unsupported('Hikaye', payload);
  }

  async publishVideo(payload: PublishPayload): Promise<PublishResult> {
    return this.publishPost(payload);
  }

  async schedulePost(payload: PublishPayload): Promise<PublishResult> {
    const rule = payload.rule;
    if (rule?.supportsScheduling) {
      // Sağlayıcı yerleşik zamanlama destekliyorsa alt sınıf bunu ezer.
      return this.publishPost(payload);
    }
    return this.unsupported('Zamanlanmış gönderi', payload);
  }

  async deletePost(_externalPostId: string, _accessToken: string): Promise<{ ok: boolean; message?: string }> {
    return { ok: false, message: `${this.label} için silme işlemi bu adaptörde desteklenmiyor.` };
  }

  async getPostStatus(_externalPostId: string, _accessToken: string): Promise<PostStatusResult> {
    return { status: 'UNKNOWN', message: 'Durum sorgusu bu platform için yapılandırılmamış.' };
  }

  async getAnalytics(_externalPostId: string, _accessToken: string): Promise<AnalyticsResult | null> {
    return null;
  }

  supports(contentType: ContentType): boolean {
    return PLATFORM_META[this.platform]?.contentTypes.includes(contentType) ?? false;
  }

  // --- Doğrulama (kural motoru ile ortak) ----------------------------------
  validateMedia(input: MediaValidationInput, rule: PlatformRuleView): MediaValidationResult {
    const issues: MediaValidationResult['issues'] = [];

    if (rule.supportedMimeTypes.length && !rule.supportedMimeTypes.includes(input.mimeType)) {
      issues.push({
        level: 'ERROR',
        code: 'MIME_UNSUPPORTED',
        message: `${this.label} bu dosya biçimini desteklemiyor (${input.mimeType}).`
      });
    }

    const maxBytes = input.kind === 'VIDEO' ? rule.maxVideoFileSize ?? rule.maxFileSize : rule.maxFileSize;
    if (input.bytes > maxBytes) {
      issues.push({
        level: 'ERROR',
        code: 'FILE_TOO_LARGE',
        message: `Dosya boyutu ${formatBytes(input.bytes)}, sınır ${formatBytes(maxBytes)}.`
      });
    }

    if (input.width && input.height) {
      if (input.width < rule.minWidth || input.height < rule.minHeight) {
        issues.push({
          level: 'WARNING',
          code: 'RESOLUTION_LOW',
          message: `Çözünürlük ${input.width}×${input.height}; ${rule.label} için önerilen en az ${rule.minWidth}×${rule.minHeight}.`
        });
      }
      const ratio = input.width / input.height;
      const allowed = rule.supportedAspectRatios.map((r) => {
        const [a, b] = r.split(':').map(Number);
        return a && b ? a / b : 1;
      });
      const nearest = allowed.reduce((best, v) => (Math.abs(v - ratio) < Math.abs(best - ratio) ? v : best), allowed[0] ?? 1);
      if (allowed.length && Math.abs(nearest - ratio) / nearest > 0.03) {
        issues.push({
          level: 'WARNING',
          code: 'RATIO_NOT_ALLOWED',
          message: `${ratio.toFixed(2)} oranı ${rule.label} için desteklenmiyor. ${rule.recommendedAspectRatio} oranına kırpılacak.`
        });
      }
    }

    if (input.kind === 'VIDEO') {
      const secs = (input.durationMs ?? 0) / 1000;
      if (rule.maxVideoDuration && secs > rule.maxVideoDuration) {
        issues.push({
          level: 'ERROR',
          code: 'VIDEO_TOO_LONG',
          message: `Video ${Math.round(secs)} sn; ${rule.label} için en fazla ${rule.maxVideoDuration} sn.`
        });
      }
    }

    return { ok: !issues.some((i) => i.level === 'ERROR'), issues };
  }

  validateCaption(caption: string, rule: PlatformRuleView): CaptionValidationResult {
    const length = rule.urlWeight ? weightedLength(caption, rule.urlWeight) : charLength(caption);
    const issues: CaptionValidationResult['issues'] = [];

    if (length > rule.maxCaptionLength) {
      issues.push({
        level: 'ERROR',
        code: 'CAPTION_TOO_LONG',
        message: `Açıklama ${length} karakter; ${rule.label} sınırı ${rule.maxCaptionLength}.`
      });
    } else if (length > rule.recommendedCaptionLength * 1.25) {
      issues.push({
        level: 'INFO',
        code: 'CAPTION_LONG',
        message: `Açıklama önerilen uzunluk (${rule.recommendedCaptionLength}) üzerinde; etkileşim düşebilir.`
      });
    }
    if (rule.minCaptionLength && length < rule.minCaptionLength) {
      issues.push({
        level: 'WARNING',
        code: 'CAPTION_TOO_SHORT',
        message: `${rule.label} için en az ${rule.minCaptionLength} karakter gerekir.`
      });
    }
    if (!rule.supportsLinks && /https?:\/\//i.test(caption)) {
      issues.push({
        level: 'INFO',
        code: 'LINKS_UNSUPPORTED',
        message: `${this.label} bu içerik türünde bağlantıları desteklemiyor.`
      });
    }
    const tags = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
    if (rule.maxHashtags && tags.length > rule.maxHashtags) {
      issues.push({
        level: 'ERROR',
        code: 'TOO_MANY_HASHTAGS',
        message: `${tags.length} hashtag kullanılmış; ${rule.label} için en fazla ${rule.maxHashtags}.`
      });
    }

    return { ok: !issues.some((i) => i.level === 'ERROR'), length, limit: rule.maxCaptionLength, issues };
  }

  // --- Yardımcılar ---------------------------------------------------------
  protected unsupported(kind: string, payload: PublishPayload): PublishResult {
    return {
      ok: false,
      demoMode: payload.demoMode,
      friendlyMessage: `${this.label} için "${kind}" yayınlama bu adaptörde henüz yapılandırılmamış.`,
      retryable: false,
      providerCode: 'UNSUPPORTED'
    };
  }

  /** Sağlayıcı çağrısı + hata eşleme. */
  protected async request<T = any>(
    url: string,
    init: RequestInit & { accessToken?: string; expected?: number[] } = {}
  ): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
    const { accessToken, expected, ...rest } = init;
    try {
      const res = await fetch(url, {
        ...rest,
        headers: {
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(rest.body && typeof rest.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
          ...(rest.headers ?? {})
        }
      });
      const text = await res.text();
      let data: T | null = null;
      try {
        data = text ? (JSON.parse(text) as T) : null;
      } catch {
        data = null;
      }
      const ok = expected ? expected.includes(res.status) : res.ok;
      return { ok, status: res.status, data, error: ok ? undefined : text.slice(0, 500) };
    } catch (err) {
      return { ok: false, status: 0, data: null, error: safeProviderMessage(err instanceof Error ? err.message : err) };
    }
  }

  /** Ham sağlayıcı hatasını PublishResult'a çevirir. */
  protected mapError(input: {
    payload: PublishPayload;
    code?: string | null;
    message?: string | null;
    httpStatus?: number | null;
  }): PublishResult {
    const friendly = toFriendlyError({ code: input.code, message: input.message, httpStatus: input.httpStatus });
    return {
      ok: false,
      demoMode: input.payload.demoMode,
      providerCode: input.code ?? null,
      providerMessage: input.message ?? null,
      httpStatus: input.httpStatus ?? null,
      friendlyMessage: friendly.friendlyMessage,
      action: friendly.action ?? null,
      retryable: friendly.retryable
    };
  }

  protected buildSuccess(payload: PublishPayload, externalPostId: string, permalink?: string | null): PublishResult {
    return {
      ok: true,
      demoMode: payload.demoMode,
      externalPostId,
      permalink: permalink ?? null,
      friendlyMessage: payload.demoMode
        ? `Demo Modu — ${this.label} için gerçek sosyal medya paylaşımı yapılmadı.`
        : `${this.label} içeriği yayınlandı.`
    };
  }
}
