import { BaseSocialProvider } from './BaseSocialProvider';
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  type OAuthConfig
} from './oauth2';
import type { AccountProfile, TokenSet } from './types';
import type { PlatformCode } from '../platforms/platforms';

/**
 * OAuth2Provider — standart OAuth 2.0 yetkilendirme kodu akışını uygulayan
 * ortak taban. Alt sınıflar yalnızca `oauthConfig()` ve yayınlama uçlarını
 * tanımlar. Böylece her platform için OAuth mantığı tekrar yazılmaz.
 */
export abstract class OAuth2Provider extends BaseSocialProvider {
  abstract readonly platform: PlatformCode;

  /** Sağlayıcıya özgü OAuth yapılandırması. */
  protected abstract oauthConfig(): OAuthConfig;

  /** Kimlik bilgileri tanımlı değilse null döner. */
  protected isConfigured(): boolean {
    const c = this.oauthConfig();
    return Boolean(c.clientId && c.clientSecret);
  }

  protected ensureConfigured(): OAuthConfig {
    const c = this.oauthConfig();
    if (!c.clientId || !c.clientSecret) {
      throw new Error(
        `${this.label} API kimlik bilgileri yapılandırılmamış. Yönetim panelinden veya ortam değişkenlerinden tanımlayın.`
      );
    }
    return c;
  }

  getAuthorizationUrl(params: { state: string; redirectUri: string; codeVerifier?: string; scopes?: string[] }): string {
    const config = this.ensureConfigured();
    if (params.scopes?.length) config.scopes = params.scopes;
    return buildAuthorizationUrl(config, params);
  }

  async exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<TokenSet> {
    const config = this.ensureConfigured();
    return exchangeAuthorizationCode({ config, ...params });
  }

  async refreshToken(token: { accessToken: string; refreshToken?: string | null }): Promise<TokenSet> {
    const config = this.ensureConfigured();
    if (!token.refreshToken) {
      // Uzun ömürlü token kullanan sağlayıcılarda (ör. Facebook sayfa token'ı)
      // yenileme gerekmez; mevcut token'ı aynen döndürürüz.
      return { accessToken: token.accessToken, refreshToken: null, tokenType: 'Bearer', expiresIn: null };
    }
    return refreshAccessToken(config, token.refreshToken);
  }

  abstract fetchAccountProfiles(accessToken: string): Promise<AccountProfile[]>;

  async validateToken(accessToken: string): Promise<{ valid: boolean; message?: string }> {
    if (!accessToken) return { valid: false, message: 'Token bulunamadı.' };
    try {
      const profiles = await this.fetchAccountProfiles(accessToken);
      return { valid: profiles.length >= 0, message: profiles.length ? undefined : 'Token geçerli ancak hesap bulunamadı.' };
    } catch (err) {
      return { valid: false, message: err instanceof Error ? err.message : 'Token doğrulanamadı.' };
    }
  }
}
