import type { OAuthConfig } from '../oauth2';
import { OAuth2Provider } from '../OAuth2Provider';
import type { AccountProfile, ContentType, PostStatusResult, PublishPayload, PublishResult } from '../types';
import type { PlatformCode } from '../../platforms/platforms';

/**
 * YouTubeProvider — YouTube Data API v3 (resumable upload).
 * Shorts: dikey oran + ≤3 dk. Yerleşik zamanlama: publishAt + privacyStatus=private.
 */
export class YouTubeProvider extends OAuth2Provider {
  readonly platform = 'YOUTUBE' as PlatformCode;

  constructor() {
    super('v3');
  }

  protected oauthConfig(): OAuthConfig {
    return {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: this.resolveClientCredentials().clientId,
      clientSecret: this.resolveClientCredentials().clientSecret,
      scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.force-ssl'],
      scopeSeparator: ' ',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' }
    };
  }

  async fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]> {
    const res = await this.request<any>(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      { accessToken }
    );
    if (!res.ok) throw new Error(res.error ?? 'YouTube kanalları alınamadı.');
    return (res.data?.items ?? []).map((c: any) => ({
      externalId: String(c.id),
      handle: c.snippet?.customUrl ? `@${c.snippet.customUrl.replace('@', '')}` : `@${c.snippet?.title ?? 'kanal'}`,
      displayName: c.snippet?.title ?? 'YouTube Kanalı',
      avatarUrl: c.snippet?.thumbnails?.default?.url ?? null,
      accountType: 'CHANNEL',
      followers: Number(c.statistics?.subscriberCount ?? 0) || null
    }));
  }

  supports(contentType: ContentType): boolean {
    return ['VIDEO', 'SHORTS'].includes(contentType);
  }

  async publishVideo(payload: PublishPayload): Promise<PublishResult> {
    const token = payload.accessToken ?? '';
    const media = payload.media?.[0];
    if (!media || media.kind !== 'VIDEO') {
      return { ok: false, demoMode: payload.demoMode, friendlyMessage: 'YouTube için bir video yüklemeniz gerekiyor.', retryable: false };
    }

    const snippet = {
      title: (payload.title ?? payload.caption.slice(0, 90) ?? 'Yeni video').slice(0, 100),
      description: this.compose(payload).slice(0, payload.rule.maxCaptionLength),
      tags: payload.hashtags.map((h) => h.replace(/^#/, '')).slice(0, 30),
      categoryId: '22'
    };
    const status: Record<string, unknown> = {
      privacyStatus: payload.scheduledFor ? 'private' : 'public',
      selfDeclaredMadeForKids: false,
      embeddable: true,
      publicStatsViewable: true
    };
    if (payload.scheduledFor) status.publishAt = payload.scheduledFor.toISOString();

    const buf = await fetch(media.url).then((r) => r.arrayBuffer()).catch(() => null);
    if (!buf) {
      return { ok: false, demoMode: payload.demoMode, friendlyMessage: 'Video dosyası depodan okunamadı.', retryable: true };
    }

    const init = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(buf.byteLength),
          'X-Upload-Content-Type': media.mimeType
        },
        body: JSON.stringify({ snippet, status })
      }
    );
    const location = init.headers.get('location');
    if (!init.ok || !location) {
      const text = await init.text().catch(() => '');
      return this.mapError({ payload, message: text.slice(0, 400) || 'Yükleme başlatılamadı.', httpStatus: init.status, retryAfter: init.headers.get('retry-after') });
    }

    const upload = await fetch(location, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': media.mimeType },
      body: new Uint8Array(buf)
    });
    const text = await upload.text();
    if (!upload.ok) return this.mapError({ payload, message: text.slice(0, 400), httpStatus: upload.status, retryAfter: upload.headers.get('retry-after') });
    try {
      const json = JSON.parse(text);
      return this.buildSuccess(payload, String(json.id), `https://www.youtube.com/watch?v=${json.id}`);
    } catch {
      return this.mapError({ payload, message: 'Yükleme yanıtı ayrıştırılamadı.', httpStatus: upload.status });
    }
  }

  async publishPost(payload: PublishPayload): Promise<PublishResult> {
    return this.publishVideo(payload);
  }

  private compose(payload: PublishPayload): string {
    const parts = [payload.caption];
    if (payload.hashtags.length) parts.push(payload.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '));
    if (payload.linkUrl) parts.push(payload.linkUrl);
    return parts.filter(Boolean).join('\n\n');
  }

  async getPostStatus(externalPostId: string, accessToken: string): Promise<PostStatusResult> {
    const res = await this.request<any>(
      `https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${externalPostId}`,
      { accessToken }
    );
    if (!res.ok) return { status: 'FAILED' as const, message: res.error };
    const item = res.data?.items?.[0];
    if (!item) return { status: 'UNKNOWN' as const };
    const st = item.status?.uploadStatus;
    return {
      status: st === 'processed' || st === 'uploaded' ? 'PUBLISHED' : st === 'failed' ? 'FAILED' : 'PROCESSING',
      externalPostId,
      permalink: `https://www.youtube.com/watch?v=${externalPostId}`,
      message: item.status?.failureReason ?? null
    } as PostStatusResult;
  }

  async getAnalytics(externalPostId: string, accessToken: string) {
    const res = await this.request<any>(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${externalPostId}`,
      { accessToken }
    );
    const s = res.data?.items?.[0]?.statistics;
    if (!res.ok || !s) return null;
    const views = Number(s.viewCount ?? 0);
    const likes = Number(s.likeCount ?? 0);
    const comments = Number(s.commentCount ?? 0);
    return {
      impressions: views,
      reach: views,
      likes,
      comments,
      shares: 0,
      saves: 0,
      clicks: 0,
      videoViews: views,
      engagementRate: views ? ((likes + comments * 2) / views) * 100 : 0,
      followerDelta: 0,
      fetchedAt: new Date(),
      source: 'API' as const
    };
  }
  async deletePost(externalPostId: string, accessToken: string) {
    const res = await this.request(`https://www.googleapis.com/youtube/v3/videos?id=${externalPostId}`, {
      method: 'DELETE',
      accessToken
    });
    return { ok: res.ok, message: res.ok ? undefined : res.error };
  }
}
