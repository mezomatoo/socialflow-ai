import { env } from '../../env';
import type { OAuthConfig } from '../oauth2';
import { OAuth2Provider } from '../OAuth2Provider';
import type { AccountProfile, ContentType, PublishPayload, PublishResult } from '../types';
import type { PlatformCode } from '../../platforms/platforms';

/**
 * PinterestProvider — Pinterest API v5.
 * Pin oluşturma: önce medya yükleme (media/upload), sonra /pins.
 */
export class PinterestProvider extends OAuth2Provider {
  readonly platform = 'PINTEREST' as PlatformCode;

  constructor() {
    super('v5');
  }

  protected oauthConfig(): OAuthConfig {
    return {
      authorizationUrl: 'https://www.pinterest.com/oauth/',
      tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
      clientId: env.providers.PINTEREST.id,
      clientSecret: env.providers.PINTEREST.secret,
      scopes: ['user_accounts:read', 'boards:read', 'boards:write', 'pins:read', 'pins:write'],
      scopeSeparator: ' ',
      pkce: true,
      clientAuth: 'basic'
    };
  }

  private headers(accessToken: string, json = true): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(json ? { 'Content-Type': 'application/json' } : {})
    };
  }

  async fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]> {
    const res = await this.request<any>('https://api.pinterest.com/v5/user_account', {
      accessToken,
      headers: this.headers(accessToken, false)
    });
    if (!res.ok) throw new Error(res.error ?? 'Pinterest hesabı alınamadı.');
    const u = res.data;
    return [
      {
        externalId: String(u.username ?? u.account_id ?? 'me'),
        handle: `@${u.username ?? 'pinterest'}`,
        displayName: u.username ?? 'Pinterest',
        avatarUrl: u.account_type ? null : null,
        accountType: 'PROFILE'
      }
    ];
  }

  supports(contentType: ContentType): boolean {
    return contentType === 'PIN';
  }

  async publishPost(payload: PublishPayload): Promise<PublishResult> {
    const token = payload.accessToken ?? '';
    const media = payload.media?.[0];
    if (!media) {
      return { ok: false, demoMode: payload.demoMode, friendlyMessage: 'Pinterest Pin için bir görsel veya video gerekli.', retryable: false };
    }

    const upload = await this.uploadMedia(media.url, media.kind === 'VIDEO' ? 'video' : 'image', token);
    if (!upload.ok) return this.mapError({ payload, message: upload.message, httpStatus: upload.status });

    const body: Record<string, unknown> = {
      title: (payload.title ?? payload.caption.split('\n')[0]).slice(0, 100),
      description: this.compose(payload).slice(0, payload.rule.maxCaptionLength),
      board_id: (payload as any).boardId ?? null,
      media_source: {
        source_type: media.kind === 'VIDEO' ? 'media_id' : 'image_url',
        ...(media.kind === 'VIDEO' ? { media_id: upload.mediaId } : { url: media.url })
      }
    };
    if (payload.linkUrl) body.link = payload.linkUrl;
    if (payload.altText) body.alt_text = payload.altText;
    if (!body.board_id) delete body.board_id;

    const res = await this.request<any>('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      accessToken: token,
      headers: this.headers(token),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      return this.mapError({
        payload,
        code: res.data?.code ? String(res.data.code) : null,
        message: res.data?.message ?? res.error,
        httpStatus: res.status,
        retryAfter: res.retryAfter ?? null
      });
    }
    const id = String(res.data?.id ?? '');
    return this.buildSuccess(payload, id, res.data?.link ?? null);
  }

  private async uploadMedia(publicUrl: string, kind: 'image' | 'video', token: string) {
    const buf = await fetch(publicUrl).then((r) => r.arrayBuffer()).catch(() => null);
    if (!buf) return { ok: false, message: 'Medya indirilemedi.', status: 0 };
    const fd = new FormData();
    fd.append(kind, new Blob([buf as unknown as BlobPart], { type: kind === 'video' ? 'video/mp4' : 'image/jpeg' }), `pin.${kind === 'video' ? 'mp4' : 'jpg'}`);
    const res = await fetch('https://api.pinterest.com/v5/media', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, message: text.slice(0, 300), status: res.status };
    try {
      const json = JSON.parse(text);
      return { ok: true, mediaId: String(json.media_id ?? ''), status: res.status, message: '' };
    } catch {
      return { ok: true, mediaId: '', status: res.status, message: '' };
    }
  }

  private compose(payload: PublishPayload): string {
    const parts = [payload.caption];
    if (payload.hashtags.length) parts.push(payload.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '));
    return parts.filter(Boolean).join('\n\n');
  }

  async getPostStatus(externalPostId: string, accessToken: string) {
    const res = await this.request<any>(`https://api.pinterest.com/v5/pins/${externalPostId}`, {
      accessToken,
      headers: this.headers(accessToken, false)
    });
    if (!res.ok) return { status: 'FAILED' as const, message: res.error };
    return { status: 'PUBLISHED' as const, externalPostId, permalink: res.data?.link ?? null };
  }
}
