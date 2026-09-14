import { env } from '../../env';
import type { OAuthConfig } from '../oauth2';
import { OAuth2Provider } from '../OAuth2Provider';
import type { AccountProfile, ContentType, PublishPayload, PublishResult } from '../types';
import type { PlatformCode } from '../../platforms/platforms';

/**
 * GoogleBusinessProvider — Google Business Profile API.
 *
 * DÜRÜSTLÜK NOTU: Google, "local post" oluşturma uç noktasını herkese açık
 * API'den kaldırdı. Bu adaptör işletme konumlarını listeler ve gönderi
 * yayınlama denemesinde kullanıcıya net bir Türkçe açıklama döndürür;
 * ASLA yayınlanmış gibi davranmaz. Google yeniden yayınlama erişimi
 * açtığında `publishPost` gövdesi doldurulur.
 */
export class GoogleBusinessProvider extends OAuth2Provider {
  readonly platform = 'GOOGLE_BUSINESS' as PlatformCode;

  constructor() {
    super('v1');
  }

  protected oauthConfig(): OAuthConfig {
    return {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: env.providers.GOOGLE_BUSINESS.id,
      clientSecret: env.providers.GOOGLE_BUSINESS.secret,
      scopes: ['https://www.googleapis.com/auth/business.manage', 'openid', 'email', 'profile'],
      scopeSeparator: ' ',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' }
    };
  }

  async fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]> {
    const res = await this.request<any>('https://mybusinessbusinessinformation.googleapis.com/v1/accounts?pageSize=20', { accessToken });
    if (!res.ok) throw new Error(res.error ?? 'Google işletme hesapları alınamadı.');
    const out: AccountProfile[] = [];
    for (const account of res.data?.accounts ?? []) {
      const locations = await this.request<any>(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,websiteUri,primaryPhone&pageSize=50`,
        { accessToken }
      );
      for (const loc of locations.data?.locations ?? []) {
        out.push({
          externalId: loc.name,
          handle: loc.title ?? 'İşletme',
          displayName: loc.title ?? 'İşletme Konumu',
          avatarUrl: null,
          accountType: 'BUSINESS'
        });
      }
    }
    return out;
  }

  supports(contentType: ContentType): boolean {
    return contentType === 'LOCAL_POST';
  }

  async publishPost(payload: PublishPayload): Promise<PublishResult> {
    return {
      ok: false,
      demoMode: payload.demoMode,
      providerCode: 'GBP_LOCAL_POSTS_UNAVAILABLE',
      friendlyMessage:
        'Google İşletme Profili gönderileri için herkese açık API erişimi Google tarafından kapatıldı. Gönderinizi Google Business Profile panelinden elle yayınlamanız gerekiyor. İçerik ve görsel bu ekranda hazırlandı.',
      action: { label: 'Entegrasyon Durumu', route: '/ayarlar/entegrasyonlar' },
      retryable: false
    };
  }
}
