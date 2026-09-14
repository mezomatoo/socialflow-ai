import { env } from '../../env';
import type { OAuthConfig } from '../oauth2';
import { OAuth2Provider } from '../OAuth2Provider';
import type { AccountProfile, ContentType, PublishPayload, PublishResult } from '../types';
import type { PlatformCode } from '../../platforms/platforms';

/**
 * ThreadsProvider — Threads API (Meta). Metin + medya gönderileri.
 * Akış: medya container → media_publish. Metin gönderisi media_type=TEXT.
 */
export class ThreadsProvider extends OAuth2Provider {
  readonly platform = 'THREADS' as PlatformCode;

  constructor() {
    super('v21.0');
  }

  protected oauthConfig(): OAuthConfig {
    return {
      authorizationUrl: 'https://threads.net/oauth/authorize',
      tokenUrl: 'https://graph.threads.net/oauth/access_token',
      clientId: env.providers.THREADS.id,
      clientSecret: env.providers.THREADS.secret,
      scopes: ['threads_basic', 'threads_content_publish'],
      scopeSeparator: ','
    };
  }

  async fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]> {
    const res = await this.request<any>(
      'https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url,followers_count',
      { accessToken }
    );
    if (!res.ok) throw new Error(res.error ?? 'Threads hesabı alınamadı.');
    const u = res.data;
    if (!u?.id) return [];
    return [
      {
        externalId: String(u.id),
        handle: `@${u.username ?? 'threads'}`,
        displayName: u.name ?? u.username ?? 'Threads',
        avatarUrl: u.threads_profile_picture_url ?? null,
        accountType: 'PROFILE',
        followers: u.followers_count ?? null
      }
    ];
  }

  supports(contentType: ContentType): boolean {
    return contentType === 'POST';
  }

  async publishPost(payload: PublishPayload): Promise<PublishResult> {
    const token = payload.accessToken ?? '';
    const userId = payload.account.externalId;
    if (!userId) {
      return { ok: false, demoMode: payload.demoMode, friendlyMessage: 'Threads kullanıcı kimliği bulunamadı.', retryable: false };
    }

    const text = this.compose(payload);
    if (text.length > payload.rule.maxCaptionLength) {
      return {
        ok: false,
        demoMode: payload.demoMode,
        friendlyMessage: `Threads gönderisi ${payload.rule.maxCaptionLength} karakteri aşamaz.`,
        retryable: false
      };
    }

    const media = payload.media?.[0];
    const createBody: Record<string, unknown> = { text };

    if (media) {
      createBody.media_type = media.kind === 'VIDEO' ? 'VIDEO' : payload.media.length > 1 ? 'CAROUSEL' : 'IMAGE';
      if (media.kind === 'VIDEO') createBody.video_url = media.url;
      else createBody.image_url = media.url;
    }

    const created = await this.request<any>(`https://graph.threads.net/v1.0/${userId}/threads`, {
      method: 'POST',
      accessToken: token,
      body: JSON.stringify(createBody)
    });
    if (!created.ok || !created.data?.id) {
      return this.mapError({
        payload,
        code: created.data?.error?.code ? String(created.data.error.code) : null,
        message: created.data?.error?.message ?? created.error,
        httpStatus: created.status
      });
    }

    const published = await this.request<any>(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
      method: 'POST',
      accessToken: token,
      body: JSON.stringify({ creation_id: String(created.data.id), idempotency_key: payload.idempotencyKey })
    });
    if (!published.ok) {
      return this.mapError({
        payload,
        code: published.data?.error?.code ? String(published.data.error.code) : null,
        message: published.data?.error?.message ?? published.error,
        httpStatus: published.status
      });
    }

    const id = String(published.data?.id ?? '');
    return this.buildSuccess(payload, id, `https://www.threads.net/@${payload.account.handle.replace('@', '')}/post/${id}`);
  }

  private compose(payload: PublishPayload): string {
    const parts = [payload.caption];
    if (payload.hashtags.length) parts.push(payload.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '));
    if (payload.linkUrl) parts.push(payload.linkUrl);
    return parts.filter(Boolean).join('\n\n');
  }

  async getPostStatus(externalPostId: string, accessToken: string) {
    const res = await this.request<any>(`https://graph.threads.net/v1.0/${externalPostId}?fields=id,permalink`, { accessToken });
    if (!res.ok) return { status: 'FAILED' as const, message: res.error };
    return { status: 'PUBLISHED' as const, externalPostId, permalink: res.data?.permalink ?? null };
  }
}
