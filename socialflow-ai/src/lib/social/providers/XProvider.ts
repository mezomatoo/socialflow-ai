import { env } from '../../env';
import type { OAuthConfig } from '../oauth2';
import { OAuth2Provider } from '../OAuth2Provider';
import type { AccountProfile, ContentType, PublishPayload, PublishResult } from '../types';
import type { PlatformCode } from '../../platforms/platforms';
import { weightedLength } from '../../text';

/**
 * XProvider — X API v2 (OAuth 2.0 + PKCE).
 * Görsel yükleme: POST /2/media/upload (chunked, video için INIT/APPEND/FINAL).
 */
export class XProvider extends OAuth2Provider {
  readonly platform = 'X' as PlatformCode;

  constructor() {
    super('v2');
  }

  protected oauthConfig(): OAuthConfig {
    return {
      authorizationUrl: 'https://x.com/i/oauth2/authorize',
      tokenUrl: 'https://api.x.com/2/oauth2/token',
      clientId: env.providers.X.id,
      clientSecret: env.providers.X.secret,
      scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'],
      scopeSeparator: ' ',
      pkce: true,
      clientAuth: 'basic'
    };
  }

  async fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]> {
    const res = await this.request<any>('https://api.x.com/2/users/me?user.fields=profile_image_url,public_metrics,username', { accessToken });
    if (!res.ok) throw new Error(res.error ?? 'X hesabı alınamadı.');
    const u = res.data?.data;
    if (!u) return [];
    return [
      {
        externalId: String(u.id),
        handle: `@${u.username}`,
        displayName: u.name,
        avatarUrl: u.profile_image_url ?? null,
        accountType: 'PROFILE',
        followers: u.public_metrics?.followers_count ?? null
      }
    ];
  }

  supports(contentType: ContentType): boolean {
    return contentType === 'POST';
  }

  async publishPost(payload: PublishPayload): Promise<PublishResult> {
    const token = payload.accessToken ?? '';
    const text = this.compose(payload);
    const limit = payload.rule.maxCaptionLength;
    if (weightedLength(text, payload.rule.urlWeight || 23) > limit) {
      return {
        ok: false,
        demoMode: payload.demoMode,
        friendlyMessage: `Metin X sınırını (${limit} karakter) aşıyor. AI ile yeniden kısaltmayı deneyin.`,
        retryable: false
      };
    }

    let mediaIds: string[] = [];
    for (const m of payload.media.slice(0, payload.rule.maxMediaCount)) {
      const uploaded = m.kind === 'VIDEO' ? await this.uploadVideo(m.url, token) : await this.uploadImage(m.url, token);
      if (!uploaded.ok) return this.mapError({ payload, code: uploaded.code, message: uploaded.message, httpStatus: uploaded.status });
      if (uploaded.mediaId) mediaIds.push(uploaded.mediaId);
    }

    const body: Record<string, unknown> = { text, idempotency_key: payload.idempotencyKey };
    if (mediaIds.length) body.media = { media_ids: mediaIds };
    if (payload.scheduledFor) {
      // X API v2 doğrudan zamanlamayı desteklemez; uygulama kuyruğu kullanılır.
    }

    const res = await this.request<any>('https://api.x.com/2/tweets', {
      method: 'POST',
      accessToken: token,
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      return this.mapError({
        payload,
        code: res.data?.errors?.[0]?.code ? String(res.data.errors[0].code) : null,
        message: res.data?.errors?.[0]?.message ?? res.data?.detail ?? res.error,
        httpStatus: res.status
      });
    }
    const id = String(res.data?.data?.id ?? '');
    return this.buildSuccess(payload, id, `https://x.com/i/status/${id}`);
  }

  private compose(payload: PublishPayload): string {
    const parts = [payload.caption];
    if (payload.hashtags.length) parts.push(payload.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '));
    return parts.filter(Boolean).join(' ');
  }

  private async uploadImage(publicUrl: string, token: string): Promise<{ ok: boolean; mediaId?: string; code?: string; message?: string; status?: number }> {
    // X medya yüklemesi bayt ister; depo URL'inden indirilir.
    const buf = await fetch(publicUrl).then((r) => r.arrayBuffer()).catch(() => null);
    if (!buf) return { ok: false, message: 'Medya indirilemedi.', status: 0 };
    const form = new URLSearchParams();
    // v1.1 media/upload hâlâ medya için kullanılıyor
    const res = await fetch('https://api.x.com/1.1/media/upload.json', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: new Uint8Array(buf)
    });
    form.delete('unused');
    const text = await res.text();
    if (!res.ok) return { ok: false, message: text.slice(0, 300), status: res.status };
    try {
      const json = JSON.parse(text);
      return { ok: true, mediaId: String(json.media_id_string ?? json.media_id ?? '') };
    } catch {
      return { ok: false, message: 'Medya yükleme yanıtı ayrıştırılamadı.', status: res.status };
    }
  }

  private async uploadVideo(publicUrl: string, token: string): Promise<{ ok: boolean; mediaId?: string; code?: string; message?: string; status?: number }> {
    // INIT → APPEND (chunked) → FINAL → STATUS poll
    const init = await fetch('https://api.x.com/1.1/media/upload.json?command=INIT&media_type=video/mp4&media_category=tweet_video', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!init.ok) return { ok: false, message: (await init.text()).slice(0, 300), status: init.status };
    const initJson: any = await init.json();
    const mediaId = String(initJson.media_id_string ?? '');

    const buf = await fetch(publicUrl).then((r) => r.arrayBuffer()).catch(() => null);
    if (!buf) return { ok: false, message: 'Video indirilemedi.' };

    const chunkSize = 5 * 1024 * 1024;
    const bytes = new Uint8Array(buf);
    let segment = 0;
    for (let offset = 0; offset < bytes.length; offset += chunkSize, segment++) {
      const chunk = bytes.slice(offset, offset + chunkSize);
      const fd = new FormData();
      fd.append('command', 'APPEND');
      fd.append('media_id', mediaId);
      fd.append('segment_index', String(segment));
      fd.append('media', new Blob([chunk as unknown as BlobPart]), 'video.mp4');
      const res = await fetch('https://api.x.com/1.1/media/upload.json', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      if (!res.ok && res.status !== 204) return { ok: false, message: (await res.text()).slice(0, 300), status: res.status };
    }

    const fin = await fetch(`https://api.x.com/1.1/media/upload.json?command=FINALIZE&media_id=${mediaId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!fin.ok) return { ok: false, message: (await fin.text()).slice(0, 300), status: fin.status };
    return { ok: true, mediaId };
  }

  async deletePost(externalPostId: string, accessToken: string) {
    const res = await this.request(`https://api.x.com/2/tweets/${externalPostId}`, { method: 'DELETE', accessToken });
    return { ok: res.ok, message: res.ok ? undefined : res.error };
  }

  async getPostStatus(externalPostId: string, accessToken: string) {
    const res = await this.request<any>(`https://api.x.com/2/tweets/${externalPostId}?tweet.fields=created_at,public_metrics`, { accessToken });
    if (!res.ok) return { status: 'FAILED' as const, message: res.error };
    return {
      status: 'PUBLISHED' as const,
      externalPostId,
      permalink: `https://x.com/i/status/${externalPostId}`
    };
  }

  async getAnalytics(externalPostId: string, accessToken: string) {
    const res = await this.request<any>(
      `https://api.x.com/2/tweets/${externalPostId}?tweet.fields=public_metrics&expansions=author_id`,
      { accessToken }
    );
    const m = res.data?.data?.public_metrics;
    if (!res.ok || !m) return null;
    const impressions = m.impression_count ?? 0;
    const engagement = (m.like_count ?? 0) + (m.reply_count ?? 0) * 2 + (m.retweet_count ?? 0) * 3 + (m.bookmark_count ?? 0) * 2;
    return {
      impressions,
      reach: impressions,
      likes: m.like_count ?? 0,
      comments: m.reply_count ?? 0,
      shares: m.retweet_count ?? 0,
      saves: m.bookmark_count ?? 0,
      clicks: m.url_link_clicks ?? 0,
      videoViews: 0,
      engagementRate: impressions ? (engagement / impressions) * 100 : 0,
      followerDelta: 0,
      fetchedAt: new Date(),
      source: 'API' as const
    };
  }
}
