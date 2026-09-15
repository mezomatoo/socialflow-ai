import { env } from '../../env';
import type { OAuthConfig } from '../oauth2';
import { OAuth2Provider } from '../OAuth2Provider';
import type { AccountProfile, ContentType, PostStatusResult, PublishPayload, PublishResult } from '../types';
import type { PlatformCode } from '../../platforms/platforms';

/**
 * LinkedInProvider — LinkedIn Share + Images/Videos API (REST, 202409 sürümü).
 * Akış: medya kaydet (registerUpload) → yükle → shares/paylaşım oluştur.
 */
export class LinkedInProvider extends OAuth2Provider {
  readonly platform = 'LINKEDIN' as PlatformCode;
  private static VERSION = '202409';

  constructor() {
    super(LinkedInProvider.VERSION);
  }

  protected oauthConfig(): OAuthConfig {
    return {
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      clientId: env.providers.LINKEDIN.id,
      clientSecret: env.providers.LINKEDIN.secret,
      scopes: ['openid', 'profile', 'email', 'w_member_social', 'w_organization_social', 'rw_organization_admin'],
      scopeSeparator: ' ',
      extraAuthParams: { prompt: 'consent' }
    };
  }

  private headers(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': LinkedInProvider.VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json'
    };
  }

  async fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]> {
    const me = await this.request<any>('https://api.linkedin.com/v2/userinfo', {
      accessToken,
      headers: this.headers(accessToken)
    });
    const out: AccountProfile[] = [];
    if (me.ok && me.data?.sub) {
      out.push({
        externalId: `urn:li:person:${me.data.sub}`,
        handle: me.data.preferred_username ? `@${me.data.preferred_username}` : me.data.name ?? 'Kişisel profil',
        displayName: me.data.name ?? 'Kişisel Profil',
        avatarUrl: me.data.picture ?? null,
        accountType: 'PROFILE'
      });
    }
    const orgs = await this.request<any>(
      'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&projection=(elements*(*,organization~(localizedName,vanityName,logoV2(original~:playableStreams))))',
      { accessToken, headers: this.headers(accessToken) }
    );
    for (const el of orgs.data?.elements ?? []) {
      const org = el['organization~'];
      if (!org) continue;
      out.push({
        externalId: `urn:li:organization:${el.organization.split(':').pop()}`,
        handle: org.vanityName ? `@${org.vanityName}` : org.localizedName,
        displayName: org.localizedName,
        avatarUrl: null,
        accountType: 'PAGE'
      });
    }
    if (!out.length && !me.ok) throw new Error(me.error ?? 'LinkedIn hesapları alınamadı.');
    return out;
  }

  supports(contentType: ContentType): boolean {
    return ['POST', 'PROFILE_POST'].includes(contentType);
  }

  async publishPost(payload: PublishPayload): Promise<PublishResult> {
    const token = payload.accessToken ?? '';
    const author = payload.account.externalId;
    if (!author) {
      return {
        ok: false,
        demoMode: payload.demoMode,
        friendlyMessage: 'LinkedIn yazar kimliği (URN) bulunamadı. Hesabı yeniden bağlayın.',
        action: { label: 'Hesabı Yeniden Bağla', route: '/app/hesaplar' },
        retryable: false
      };
    }

    const media = payload.media?.[0];
    const body: Record<string, unknown> = {
      author,
      commentary: this.compose(payload),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: payload.scheduledFor ? 'SCHEDULED' : 'PUBLISHED',
      isReshareDisabledByAuthor: false
    };
    if (payload.scheduledFor) body.publishedAt = payload.scheduledFor.getTime();

    if (media?.kind === 'IMAGE') {
      const asset = await this.registerImage(media.url, author, token);
      if (!asset.ok) return this.mapError({ payload, message: asset.message, httpStatus: asset.status });
      body.content = { media: { title: { text: payload.title ?? payload.caption.slice(0, 200) }, id: asset.id } };
    } else if (media?.kind === 'VIDEO') {
      const asset = await this.registerVideo(media.url, author, token);
      if (!asset.ok) return this.mapError({ payload, message: asset.message, httpStatus: asset.status });
      body.content = { media: { title: { text: payload.title ?? payload.caption.slice(0, 200) }, id: asset.id } };
    } else if (payload.linkUrl) {
      body.content = { article: { source: payload.linkUrl, title: payload.title ?? payload.caption.slice(0, 200) } };
    }

    const res = await this.request<any>('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      accessToken: token,
      headers: this.headers(token),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      return this.mapError({
        payload,
        code: res.data?.status ? String(res.data.status) : null,
        message: res.data?.message ?? res.error,
        httpStatus: res.status,
        retryAfter: res.retryAfter ?? null
      });
    }
    const id = String(res.data?.id ?? res.data ?? '');
    return this.buildSuccess(payload, id, `https://www.linkedin.com/feed/update/${id}`);
  }

  private compose(payload: PublishPayload): string {
    const parts = [payload.caption];
    if (payload.hashtags.length) parts.push(payload.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '));
    return parts.filter(Boolean).join('\n\n');
  }

  private async registerImage(publicUrl: string, author: string, token: string): Promise<{ ok: boolean; id?: string; message?: string; status?: number }> {
    const res = await this.request<any>('https://api.linkedin.com/rest/images?action=initializeUpload', {
      method: 'POST',
      accessToken: token,
      headers: this.headers(token),
      body: JSON.stringify({ initializeUploadRequest: { owner: author } })
    });
    const upload = res.data?.value?.uploadUrl;
    const asset = res.data?.value?.image;
    if (!res.ok || !upload || !asset) return { ok: false, message: res.data?.message ?? res.error, status: res.status };

    const buf = await fetch(publicUrl).then((r) => r.arrayBuffer()).catch(() => null);
    if (!buf) return { ok: false, message: 'Medya indirilemedi.' };
    const put = await fetch(upload, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(buf)
    });
    if (!put.ok) return { ok: false, message: `Yükleme başarısız (HTTP ${put.status})`, status: put.status };
    return { ok: true, id: asset };
  }

  private async registerVideo(publicUrl: string, author: string, token: string): Promise<{ ok: boolean; id?: string; message?: string; status?: number }> {
    const res = await this.request<any>('https://api.linkedin.com/rest/videos?action=initializeUpload', {
      method: 'POST',
      accessToken: token,
      headers: this.headers(token),
      body: JSON.stringify({ initializeUploadRequest: { owner: author, fileSizeBytes: 0, uploadCaptions: false, uploadThumbnail: false } })
    });
    const upload = res.data?.value?.uploadUrl;
    const asset = res.data?.value?.video;
    if (!res.ok || !upload || !asset) return { ok: false, message: res.data?.message ?? res.error, status: res.status };
    const buf = await fetch(publicUrl).then((r) => r.arrayBuffer()).catch(() => null);
    if (!buf) return { ok: false, message: 'Video indirilemedi.' };
    const put = await fetch(upload, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: new Uint8Array(buf) });
    if (!put.ok) return { ok: false, message: `Video yüklenemedi (HTTP ${put.status})`, status: put.status };
    return { ok: true, id: asset };
  }

  async getPostStatus(externalPostId: string, accessToken: string): Promise<PostStatusResult> {
    const res = await this.request<any>(`https://api.linkedin.com/rest/posts/${encodeURIComponent(externalPostId)}`, {
      accessToken,
      headers: this.headers(accessToken)
    });
    if (!res.ok) return { status: 'FAILED' as const, message: res.error };
    const state = res.data?.lifecycleState;
    return {
      status: state === 'PUBLISHED' ? 'PUBLISHED' : state === 'SCHEDULED' ? 'PENDING' : 'UNKNOWN',
      externalPostId,
      permalink: `https://www.linkedin.com/feed/update/${externalPostId}`
    } as PostStatusResult;
  }
}
