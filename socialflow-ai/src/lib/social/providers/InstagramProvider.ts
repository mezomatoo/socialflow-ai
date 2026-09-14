import { env } from '../../env';
import type { OAuthConfig } from '../oauth2';
import { OAuth2Provider } from '../OAuth2Provider';
import type { AccountProfile, ContentType, PublishPayload, PublishResult } from '../types';
import type { PlatformCode } from '../../platforms/platforms';

/**
 * InstagramProvider — Instagram Graph API (Content Publishing).
 * Gereksinim: Instagram Business/Creator hesabı + bağlı Facebook Sayfası.
 * Akış: medya container oluştur → yayınla → durum sorgula.
 */
export class InstagramProvider extends OAuth2Provider {
  readonly platform = 'INSTAGRAM' as PlatformCode;

  constructor() {
    super('v21.0');
  }

  protected oauthConfig(): OAuthConfig {
    return {
      authorizationUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
      clientId: env.providers.INSTAGRAM.id,
      clientSecret: env.providers.INSTAGRAM.secret,
      scopes: [
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_insights',
        'pages_show_list',
        'pages_read_engagement',
        'business_management'
      ],
      scopeSeparator: ',',
      extraAuthParams: { auth_type: 'rerequest' }
    };
  }

  async fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]> {
    const me = await this.request<any>(
      'https://graph.facebook.com/v21.0/me/accounts?fields=id,name,picture,access_token,instagram_business_account{id,username,profile_picture_url,followers_count}',
      { accessToken }
    );
    if (!me.ok) throw new Error(me.error ?? 'Instagram hesapları alınamadı.');
    const pages = me.data?.data ?? [];
    const out: AccountProfile[] = [];
    for (const page of pages) {
      const ig = page.instagram_business_account;
      if (!ig) continue;
      out.push({
        externalId: String(ig.id),
        handle: `@${ig.username ?? page.name}`,
        displayName: page.name,
        avatarUrl: ig.profile_picture_url ?? page.picture?.data?.url ?? null,
        accountType: 'BUSINESS',
        followers: ig.followers_count ?? null
      });
    }
    if (!out.length) {
      throw new Error('Bu Facebook hesabına bağlı bir Instagram işletme hesabı bulunamadı.');
    }
    return out;
  }

  supports(contentType: ContentType): boolean {
    return ['FEED', 'STORY', 'REEL'].includes(contentType);
  }

  async publishPost(payload: PublishPayload): Promise<PublishResult> {
    return this.publishMedia(payload);
  }

  async publishStory(payload: PublishPayload): Promise<PublishResult> {
    return this.publishMedia(payload);
  }

  async publishVideo(payload: PublishPayload): Promise<PublishResult> {
    return this.publishMedia(payload);
  }

  /**
   * Container → publish akışı. Instagram medyanın HERKESSE AÇIK bir URL'den
   * çekilmesini ister; bu nedenle medya deposu (S3) zorunludur.
   */
  private async publishMedia(payload: PublishPayload): Promise<PublishResult> {
    const media = payload.media?.[0];
    if (!media) {
      return { ok: false, demoMode: payload.demoMode, friendlyMessage: 'Instagram için medya yüklenmemiş.', retryable: false };
    }
    const isCarousel = payload.media.length > 1 && payload.rule.supportsCarousel;
    const params = new URLSearchParams({
      access_token: '', // header ile gönderiyoruz
      image_url: media.url,
      caption: this.composeCaption(payload),
      media_type: this.igMediaType(payload, isCarousel),
      alt_text: payload.altText ?? ''
    });
    if (payload.contentType === 'REEL') {
      params.set('media_type', 'REELS');
      params.set('video_url', media.url);
      params.set('share_to_feed', 'true');
    }
    if (payload.contentType === 'STORY') params.set('media_type', 'STORIES');
    params.delete('access_token');

    const created = await this.request<any>(
      `https://graph.facebook.com/v21.0/${payload.account.externalId}/media`,
      { method: 'POST', accessToken: this.tokenOf(payload), body: JSON.stringify(Object.fromEntries(params)) }
    );
    if (!created.ok || !created.data?.id) {
      return this.mapError({
        payload,
        code: created.data?.error?.code ? String(created.data.error.code) : null,
        message: created.data?.error?.message ?? created.error,
        httpStatus: created.status
      });
    }

    const containerId = String(created.data.id);

    // Reels/Video container'ının işlenmesini bekle
    if (payload.contentType === 'REEL' || media.kind === 'VIDEO') {
      const status = await this.pollContainer(containerId, this.tokenOf(payload));
      if (status !== 'FINISHED') {
        return this.mapError({ payload, code: 'CONTAINER_' + status, message: `Medya işlenemedi (${status}).`, httpStatus: 400 });
      }
    }

    const published = await this.request<any>(
      `https://graph.facebook.com/v21.0/${payload.account.externalId}/media_publish`,
      {
        method: 'POST',
        accessToken: this.tokenOf(payload),
        body: JSON.stringify({ creation_id: containerId, idempotency_key: payload.idempotencyKey })
      }
    );

    if (!published.ok || !published.data?.id) {
      return this.mapError({
        payload,
        code: published.data?.error?.code ? String(published.data.error.code) : null,
        message: published.data?.error?.message ?? published.error,
        httpStatus: published.status
      });
    }

    const mediaId = String(published.data.id);
    const permalink = `https://www.instagram.com/p/${mediaId}/`;
    return this.buildSuccess(payload, mediaId, permalink);
  }

  private async pollContainer(containerId: string, accessToken: string, tries = 12): Promise<string> {
    for (let i = 0; i < tries; i++) {
      const res = await this.request<any>(`https://graph.facebook.com/v21.0/${containerId}?fields=status_code,status`, { accessToken });
      const code = res.data?.status_code ?? 'IN_PROGRESS';
      if (code === 'FINISHED' || code === 'ERROR' || code === 'EXPIRED') return code;
      await new Promise((r) => setTimeout(r, 2500));
    }
    return 'TIMEOUT';
  }

  private igMediaType(payload: PublishPayload, isCarousel: boolean): string {
    if (isCarousel) return 'CAROUSEL';
    const media = payload.media[0];
    return media?.kind === 'VIDEO' ? 'REELS' : 'IMAGE';
  }

  private composeCaption(payload: PublishPayload): string {
    const parts = [payload.caption];
    if (payload.hashtagPlacement !== 'FIRST_COMMENT' && payload.hashtags.length) {
      parts.push(payload.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '));
    }
    return parts.filter(Boolean).join('\n\n').slice(0, payload.rule.maxCaptionLength);
  }

  /** Token payload içine gömülmez; servis katmanı sağlar. */
  private tokenOf(payload: PublishPayload & { accessToken?: string }): string {
    return (payload as any).accessToken ?? '';
  }

  async deletePost(externalPostId: string, accessToken: string) {
    const res = await this.request(`https://graph.facebook.com/v21.0/${externalPostId}`, {
      method: 'DELETE',
      accessToken
    });
    return { ok: res.ok, message: res.ok ? undefined : res.error };
  }

  async getPostStatus(externalPostId: string, accessToken: string) {
    const res = await this.request<any>(
      `https://graph.facebook.com/v21.0/${externalPostId}?fields=id,permalink,media_type,timestamp`,
      { accessToken }
    );
    if (!res.ok) return { status: 'FAILED' as const, message: res.error };
    return {
      status: 'PUBLISHED' as const,
      externalPostId: String(res.data?.id ?? externalPostId),
      permalink: res.data?.permalink ?? null
    };
  }

  async getAnalytics(externalPostId: string, accessToken: string) {
    const res = await this.request<any>(
      `https://graph.facebook.com/v21.0/${externalPostId}/insights?metric=reach,impressions,likes,comments,saved,shares,total_interactions`,
      { accessToken }
    );
    if (!res.ok || !res.data?.data) return null;
    const map = new Map<string, number>();
    for (const item of res.data.data as any[]) {
      const value = Array.isArray(item.values) ? Number(item.values[0]?.value ?? 0) : Number(item.values ?? 0);
      map.set(item.name, Number.isFinite(value) ? value : 0);
    }
    const impressions = map.get('impressions') ?? 0;
    const engagement = (map.get('likes') ?? 0) + (map.get('comments') ?? 0) + (map.get('shares') ?? 0) + (map.get('saved') ?? 0);
    return {
      impressions,
      reach: map.get('reach') ?? 0,
      likes: map.get('likes') ?? 0,
      comments: map.get('comments') ?? 0,
      shares: map.get('shares') ?? 0,
      saves: map.get('saved') ?? 0,
      clicks: 0,
      videoViews: 0,
      engagementRate: impressions ? (engagement / impressions) * 100 : 0,
      followerDelta: 0,
      fetchedAt: new Date(),
      source: 'API' as const
    };
  }
}
