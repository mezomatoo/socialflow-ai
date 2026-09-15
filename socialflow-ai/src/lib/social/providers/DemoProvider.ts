import { unavailableEngagement } from '../engagement';
import type { PlatformRuleView } from '../../rules/ruleEngine';
import type {
  AccountProfile,
  CaptionValidationResult,
  MediaValidationInput,
  MediaValidationResult,
  PostStatusResult,
  PublishPayload,
  PublishResult,
  SocialProvider,
  TokenSet
} from '../types';
import type { ContentType, PlatformCode } from '../../platforms/platforms';
import { PLATFORM_META } from '../../platforms/platforms';
import { charLength } from '../../text';

/**
 * DemoProvider — DEMO MODU.
 * ---------------------------------------------------------------------------
 * Gerçek sosyal medya paylaşımı YAPMAZ ve yapmış gibi davranmaz.
 * Yayınlama hattının (kuyruk → doğrulama → deneme → durum → bildirim →
 * tekrar dene) uçtan uca test edilebilmesi için gerçekçi bir simülasyon
 * üretir. Sonuçlar her zaman `demoMode: true` ile işaretlenir ve arayüzde
 * "Demo Modu — gerçek sosyal medya paylaşımı yapılmadı." uyarısı gösterilir.
 */

export interface DemoOptions {
  /** Ağ gecikmesi simülasyonu (ms). */
  latencyMs?: number;
  /** Belirli platformlarda kasıtlı hata üret (retry akışını test etmek için). */
  failingPlatforms?: PlatformCode[];
}

export class DemoProvider implements SocialProvider {
  getEngagementCapabilities() { return unavailableEngagement(); }
  readonly platform: PlatformCode;
  readonly apiVersion = 'demo';
  private opts: DemoOptions;

  constructor(platform: PlatformCode, opts: DemoOptions = {}) {
    this.platform = platform;
    this.opts = opts;
  }

  get label(): string {
    return PLATFORM_META[this.platform]?.name ?? this.platform;
  }

  getAuthorizationUrl(): string {
    return '/sosyal-hesaplar?demo=1';
  }

  async exchangeCode(): Promise<TokenSet> {
    return { accessToken: 'demo-access-token', refreshToken: 'demo-refresh-token', tokenType: 'Demo', expiresIn: 3600 };
  }

  async refreshToken(token: { accessToken: string; refreshToken?: string | null }): Promise<TokenSet> {
    return { accessToken: token.accessToken, refreshToken: token.refreshToken ?? null, tokenType: 'Demo', expiresIn: 3600 };
  }

  async fetchAccountProfiles(): Promise<AccountProfile[]> {
    return [];
  }

  async validateToken(): Promise<{ valid: boolean; message?: string }> {
    return { valid: true, message: 'Demo modu — token doğrulaması atlandı.' };
  }

  validateMedia(_input: MediaValidationInput, _rule: PlatformRuleView): MediaValidationResult {
    return { ok: true, issues: [] };
  }

  validateCaption(caption: string, rule: PlatformRuleView): CaptionValidationResult {
    const length = charLength(caption);
    return {
      ok: length <= rule.maxCaptionLength,
      length,
      limit: rule.maxCaptionLength,
      issues: length > rule.maxCaptionLength
        ? [{ level: 'ERROR', code: 'CAPTION_TOO_LONG', message: `Açıklama ${length} karakter; sınır ${rule.maxCaptionLength}.` }]
        : []
    };
  }

  supports(contentType: ContentType): boolean {
    return PLATFORM_META[this.platform]?.contentTypes.includes(contentType) ?? false;
  }

  private async publish(payload: PublishPayload, kind: string): Promise<PublishResult> {
    const latency = this.opts.latencyMs ?? 600 + Math.random() * 900;
    await new Promise((r) => setTimeout(r, latency));

    if (this.opts.failingPlatforms?.includes(this.platform)) {
      return {
        ok: false,
        demoMode: true,
        providerCode: 'DEMO_SIMULATED_FAILURE',
        providerMessage: 'Simulated provider failure',
        httpStatus: 401,
        friendlyMessage: `${this.label} oturumunuzun süresi dolmuş. Hesabınızı yeniden bağlamanız gerekiyor.`,
        action: { label: 'Hesabı Yeniden Bağla', route: '/sosyal-hesaplar' },
        retryable: false
      };
    }

    const id = `demo_${this.platform.toLowerCase()}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    return {
      ok: true,
      demoMode: true,
      externalPostId: id,
      permalink: null,
      friendlyMessage: `Demo Modu — ${this.label} (${kind}) için gerçek sosyal medya paylaşımı yapılmadı.`
    };
  }

  publishPost(payload: PublishPayload) {
    return this.publish(payload, 'Gönderi');
  }
  publishStory(payload: PublishPayload) {
    return this.publish(payload, 'Hikaye');
  }
  publishVideo(payload: PublishPayload) {
    return this.publish(payload, 'Video');
  }
  async schedulePost(payload: PublishPayload): Promise<PublishResult> {
    const res = await this.publish(payload, 'Planlı');
    return { ...res, providerScheduled: false };
  }

  async deletePost(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true, message: 'Demo modu — silme işlemi simüle edildi.' };
  }

  async getPostStatus(externalPostId: string): Promise<PostStatusResult> {
    return { status: 'PUBLISHED', externalPostId, message: 'Demo modu' };
  }

  async getAnalytics(): Promise<null> {
    // Sahte analitik ÜRETMEYİZ.
    return null;
  }
}
