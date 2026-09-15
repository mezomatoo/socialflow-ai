import { env } from '../../env';
import type { OAuthConfig } from '../oauth2';
import { OAuth2Provider } from '../OAuth2Provider';
import type { AccountProfile, ContentType, PublishPayload, PublishResult } from '../types';
import type { PlatformCode } from '../../platforms/platforms';

/**
 * FacebookProvider — Facebook Graph API (Pages).
 * Gönderi, Hikaye ve Reels yayınlama; yerleşik zamanlama (published=false +
 * scheduled_publish_time) desteği.
 */
export class FacebookProvider extends OAuth2Provider {
  readonly platform = 'FACEBOOK' as PlatformCode;

  constructor() {
    super('v21.0');
  }

  protected oauthConfig(): OAuthConfig {
    return {
      authorizationUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
      clientId: env.providers.FACEBOOK.id,
      clientSecret: env.providers.FACEBOOK.secret,
      scopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'pages_manage_engagement', 'business_management'],
      scopeSeparator: ','
    };
  }

  async fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]> {
    const res = await this.request<any>(
      'https://graph.facebook.com/v21.0/me/accounts?fields=id,name,picture,category,fan_count,access_token',
      { accessToken }
    );
    if (!res.ok) throw new Error(res.error ?? 'Facebook sayfaları alınamadı.');
    return (res.data?.data ?? []).map((p: any) => ({
      externalId: String(p.id),
      handle: p.username ? `@${p.username}` : p.name,
      displayName: p.name,
      avatarUrl: p.picture?.data?.url ?? null,
      accountType: 'PAGE',
      followers: p.fan_count ?? null
    }));
  }

  supports(contentType: ContentType): boolean {
    return ['FEED', 'STORY', 'REEL'].includes(contentType);
  }

  async publishPost(payload: PublishPayload): Promise<PublishResult> {
    const token = (payload as any).accessToken ?? '';
    const pageId = payload.account.externalId;
    if (!pageId) return this.missingAccount(payload);

    const media = payload.media?.[0];
    const caption = this.compose(payload);
    const scheduling = payload.scheduledFor ? Math.floor(payload.scheduledFor.getTime() / 1000) : null;

    if (media?.kind === 'VIDEO') {
      const body: Record<string, unknown> = {
        file_url: media.url,
        description: caption,
        published: scheduling ? false : true
      };
      if (scheduling) {
        body.scheduled_publish_time = scheduling;
        body.unpublished_content_type = 'SCHEDULED';
      }
      const res = await this.request<any>(`https://graph-video.facebook.com/v21.0/${pageId}/videos`, {
        method: 'POST',
        accessToken: token,
        body: JSON.stringify(body)
      });
      if (!res.ok) return this.fbError(payload, res);
      return this.buildSuccess(payload, String(res.data.id), `https://www.facebook.com/videos/${res.data.id}`);
    }

    if (media?.kind === 'IMAGE') {
      const body: Record<string, unknown> = { url: media.url, caption };
      if (scheduling) {
        body.published = false;
        body.scheduled_publish_time = scheduling;
      }
      const endpoint = payload.contentType === 'STORY' ? 'photo_stories' : 'photos';
      const res = await this.request<any>(`https://graph.facebook.com/v21.0/${pageId}/${endpoint}`, {
        method: 'POST',
        accessToken: token,
        body: JSON.stringify(body)
      });
      if (!res.ok) return this.fbError(payload, res);
      const postId = String(res.data.post_id ?? res.data.id);
      return this.buildSuccess(payload, postId, `https://www.facebook.com/${postId}`);
    }

    // Metin/bağlantı gönderisi
    const body: Record<string, unknown> = { message: caption };
    if (payload.linkUrl) body.link = payload.linkUrl;
    if (scheduling) {
      body.published = false;
      body.scheduled_publish_time = scheduling;
    }
    const res = await this.request<any>(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
      method: 'POST',
      accessToken: token,
      body: JSON.stringify(body)
    });
    if (!res.ok) return this.fbError(payload, res);
    const postId = String(res.data.id);
    return this.buildSuccess(payload, postId, `https://www.facebook.com/${postId.replace('_', '/posts/')}`);
  }

  async publishStory(payload: PublishPayload): Promise<PublishResult> {
    const token = (payload as any).accessToken ?? '';
    const pageId = payload.account.externalId;
    if (!pageId) return this.missingAccount(payload);
    const media = payload.media?.[0];
    if (!media) return this.missingMedia(payload);

    // 1) fotoğraf/video için story item oluştur
    const startBody: Record<string, unknown> = {
      page_id: pageId,
      image_url: media.kind === 'IMAGE' ? media.url : undefined,
      video_url: media.kind === 'VIDEO' ? media.url : undefined
    };
    const start = await this.request<any>('https://graph.facebook.com/v21.0/photo_stories', {
      method: 'POST',
      accessToken: token,
      body: JSON.stringify({ ...startBody, published: false })
    });
    if (!start.ok) return this.fbError(payload, start);
    const creationId = String(start.data.id);

    const publish = await this.request<any>('https://graph.facebook.com/v21.0/photo_stories', {
      method: 'POST',
      accessToken: token,
      body: JSON.stringify({ page_id: pageId, creation_id: creationId, published: true })
    });
    if (!publish.ok) return this.fbError(payload, publish);
    return this.buildSuccess(payload, String(publish.data.id), null);
  }

  async publishVideo(payload: PublishPayload): Promise<PublishResult> {
    return this.publishPost({ ...payload, contentType: 'REEL' });
  }

  async deletePost(externalPostId: string, accessToken: string) {
    const res = await this.request(`https://graph.facebook.com/v21.0/${externalPostId}`, { method: 'DELETE', accessToken });
    return { ok: res.ok, message: res.ok ? undefined : res.error };
  }

  async getPostStatus(externalPostId: string, accessToken: string) {
    const res = await this.request<any>(
      `https://graph.facebook.com/v21.0/${externalPostId}?fields=id,permalink_url,status_type,is_published,scheduled_publish_time`,
      { accessToken }
    );
    if (!res.ok) return { status: 'FAILED' as const, message: res.error };
    const d = res.data;
    if (d?.is_published === false) return { status: 'PENDING' as const, externalPostId: String(d.id), message: 'Zamanlanmış gönderi' };
    return { status: 'PUBLISHED' as const, externalPostId: String(d?.id ?? externalPostId), permalink: d?.permalink_url ?? null };
  }

  async getAnalytics(externalPostId: string, accessToken: string) {
    const res = await this.request<any>(
      `https://graph.facebook.com/v21.0/${externalPostId}/insights?metric=post_impressions,post_impressions_unique,post_reactions_like_total,post_comments,post_shares`,
      { accessToken }
    );
    if (!res.ok || !res.data?.data) return null;
    const map = new Map<string, number>();
    for (const item of res.data.data as any[]) {
      const v = Array.isArray(item.values) ? Number(item.values[0]?.value ?? 0) : 0;
      map.set(item.name, Number.isFinite(v) ? v : 0);
    }
    const impressions = map.get('post_impressions') ?? 0;
    const engagement = (map.get('post_reactions_like_total') ?? 0) + (map.get('post_comments') ?? 0) + (map.get('post_shares') ?? 0);
    return {
      impressions,
      reach: map.get('post_impressions_unique') ?? 0,
      likes: map.get('post_reactions_like_total') ?? 0,
      comments: map.get('post_comments') ?? 0,
      shares: map.get('post_shares') ?? 0,
      saves: 0,
      clicks: 0,
      videoViews: 0,
      engagementRate: impressions ? (engagement / impressions) * 100 : 0,
      followerDelta: 0,
      fetchedAt: new Date(),
      source: 'API' as const
    };
  }

  // --- yardımcılar ---
  private compose(payload: PublishPayload): string {
    const parts = [payload.caption];
    if (payload.hashtags.length) parts.push(payload.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '));
    return parts.filter(Boolean).join('\n\n');
  }

  private fbError(payload: PublishPayload, res: { status: number; data: any; error?: string; retryAfter?: string | null }): PublishResult {
    const err = res.data?.error;
    return this.mapError({
      payload,
      code: err?.code ? `OAuthException ${err.code}${err.error_subcode ? `/${err.error_subcode}` : ''}` : null,
      message: err?.message ?? res.error,
      httpStatus: res.status,
      retryAfter: res.retryAfter ?? null
    });
  }

  private missingAccount(payload: PublishPayload): PublishResult {
    return {
      ok: false,
      demoMode: payload.demoMode,
      friendlyMessage: 'Facebook sayfa kimliği bulunamadı. Hesabı yeniden bağlayın.',
      action: { label: 'Hesabı Yeniden Bağla', route: '/app/hesaplar' },
      retryable: false
    };
  }

  private missingMedia(payload: PublishPayload): PublishResult {
    return { ok: false, demoMode: payload.demoMode, friendlyMessage: 'Facebook hikayesi için medya gerekli.', retryable: false };
  }
}
