import type { OAuthConfig } from '../oauth2';
import { OAuth2Provider } from '../OAuth2Provider';
import type { AccountProfile, ContentType, PublishPayload, PublishResult } from '../types';
import type { PlatformCode } from '../../platforms/platforms';

/**
 * TikTokProvider — TikTok Content Posting API (v2).
 * Doğrudan yayınlama (DIRECT_POST) izni uygulama denetimine tabidir.
 * İzin yoksa video kullanıcının TikTok taslaklarına gönderilir.
 */
export class TikTokProvider extends OAuth2Provider {
  readonly platform = 'TIKTOK' as PlatformCode;

  constructor() {
    super('v2');
  }

  protected oauthConfig(): OAuthConfig {
    return {
      authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize/',
      tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
      clientId: this.resolveClientCredentials().clientId,
      clientSecret: this.resolveClientCredentials().clientSecret,
      scopes: ['user.info.basic', 'video.publish', 'video.upload'],
      scopeSeparator: ' ',
      pkce: true,
      clientAuth: 'body'
    };
  }

  async fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]> {
    const res = await this.request<any>('https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,follower_count', {
      method: 'POST',
      accessToken,
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(res.error ?? 'TikTok hesabı alınamadı.');
    const u = res.data?.data?.user;
    if (!u) return [];
    return [
      {
        externalId: String(u.open_id),
        handle: `@${u.display_name ?? 'tiktok'}`,
        displayName: u.display_name ?? 'TikTok Hesabı',
        avatarUrl: u.avatar_url ?? null,
        accountType: 'PROFILE',
        followers: u.follower_count ?? null
      }
    ];
  }

  supports(contentType: ContentType): boolean {
    return contentType === 'VIDEO';
  }

  async publishVideo(payload: PublishPayload): Promise<PublishResult> {
    const token = payload.accessToken ?? '';
    const media = payload.media?.[0];
    if (!media || media.kind !== 'VIDEO') {
      return { ok: false, demoMode: payload.demoMode, friendlyMessage: 'TikTok yalnızca video kabul ediyor.', retryable: false };
    }

    // 1) Yükleme başlat
    const init = await this.request<any>('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      accessToken: token,
      body: JSON.stringify({
        post_info: {
          title: this.compose(payload).slice(0, payload.rule.maxCaptionLength),
          privacy_level: 'SELF_ONLY',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_size: media.bytes,
          chunk_size: media.bytes,
          total_chunk_count: 1,
          video_url: media.url
        }
      })
    });

    if (!init.ok) {
      return this.mapError({
        payload,
        code: init.data?.error?.code ?? null,
        message: init.data?.error?.message ?? init.data?.message ?? init.error,
        httpStatus: init.status,
        retryAfter: init.retryAfter ?? null
      });
    }

    const publishId = String(init.data?.data?.publish_id ?? '');
    return {
      ok: true,
      demoMode: payload.demoMode,
      externalPostId: publishId,
      permalink: null,
      providerScheduled: false,
      // Faz 2: TikTok yüklemeyi kabul eder ama yayın asenkron işlenir (§51).
      processing: !payload.demoMode,
      friendlyMessage: payload.demoMode
        ? 'Simülasyon — TikTok için gerçek video yüklemesi yapılmadı (API kimlik bilgisi tanımlı değil).'
        : 'TikTok videosu işleniyor. Yükleme durumu birkaç dakika içinde güncellenir.'
    };
  }

  async publishPost(payload: PublishPayload): Promise<PublishResult> {
    return this.publishVideo(payload);
  }

  private compose(payload: PublishPayload): string {
    const parts = [payload.caption];
    if (payload.hashtags.length) parts.push(payload.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '));
    return parts.filter(Boolean).join(' ');
  }

  async getPostStatus(externalPostId: string, accessToken: string) {
    const res = await this.request<any>('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ publish_id: externalPostId })
    });
    if (!res.ok) return { status: 'FAILED' as const, message: res.error };
    const st = res.data?.data?.status;
    if (st === 'PUBLISH_COMPLETE') return { status: 'PUBLISHED' as const, externalPostId };
    if (st === 'FAILED') return { status: 'FAILED' as const, message: res.data?.data?.fail_reason ?? 'Yükleme başarısız.' };
    return { status: 'PROCESSING' as const, externalPostId, message: 'Video işleniyor.' };
  }
}
