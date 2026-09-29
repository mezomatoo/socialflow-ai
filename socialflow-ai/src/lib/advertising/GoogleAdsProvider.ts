import { env } from '../env';
import type { TokenSet } from '../social/types';
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  type OAuthConfig
} from '../social/oauth2';
import {
  AdvertisingError,
  noAdCapabilities,
  type AdCapabilities,
  type AdProviderInfo,
  type AdvertisingAccessContext,
  type AdvertisingProviderAdapter,
  type ProviderAdAccount,
  type ProviderCampaignRead,
  type ProviderPage
} from './contracts';

/**
 * Google Ads read-only adapter.
 *
 * Google Ads is deliberately kept separate from the organic Google/YouTube
 * providers. The OAuth token is stored in AdAccountCredential, never in a
 * SocialProviderToken, and every provider request carries the developer token
 * server-side. No token or raw provider response is returned to the browser.
 */
export class GoogleAdsProvider implements AdvertisingProviderAdapter {
  readonly info: AdProviderInfo = Object.freeze({
    code: 'GOOGLE',
    name: 'Google Ads',
    placementsLabel: 'Google · YouTube',
    color: '#4285f4',
    implementation: 'READ_ONLY',
    apiVersion: env.advertising.googleAds.apiVersion
  });

  getCapabilities(): AdCapabilities {
    // Fail closed when the server is not configured. This keeps the provider
    // directory honest in demo/test environments and prevents UI claims based
    // on an adapter whose API credentials cannot be used.
    const credentials = env.providers.GOOGLE_ADS;
    if (!credentials?.id || !credentials.secret || !env.advertising.googleAds.developerToken) return noAdCapabilities();
    const capabilities = noAdCapabilities();
    return Object.freeze({
      ...capabilities,
      supportsAdAccountRead: true,
      supportsCampaignRead: true
    });
  }

  getAuthorizationUrl(params: { state: string; redirectUri: string; codeVerifier?: string }): string {
    return buildAuthorizationUrl(this.oauthConfig(), params);
  }

  exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<TokenSet> {
    return exchangeAuthorizationCode({ config: this.oauthConfig(), ...params });
  }

  async readAdAccounts(context: AdvertisingAccessContext, cursor?: string): Promise<ProviderPage<ProviderAdAccount>> {
    if (cursor) throw new AdvertisingError('INVALID_CURSOR', 'Google Ads hesap listesi için geçersiz imleç.');
    this.requireDeveloperToken();
    const response = await this.request<{ resourceNames?: unknown[] }>(context, '/customers:listAccessibleCustomers', { method: 'GET' });
    const resources = Array.isArray(response.resourceNames) ? response.resourceNames : [];
    const items: ProviderAdAccount[] = [];

    // Accessible customers can include manager accounts. Querying each resource
    // keeps the returned DTO uniform and avoids exposing Google’s raw payload.
    for (const resource of resources) {
      const id = typeof resource === 'string' ? resource.match(/^customers\/(\d+)$/)?.[1] : null;
      if (!id) continue;
      const customer = await this.readCustomer(context, id);
      if (customer) items.push(customer);
    }

    return { items, nextCursor: null };
  }

  async readCampaigns(context: AdvertisingAccessContext, providerAccountId: string, cursor?: string): Promise<ProviderPage<ProviderCampaignRead>> {
    this.requireDeveloperToken();
    if (!/^\d{3,20}$/.test(providerAccountId)) throw new AdvertisingError('INVALID_ACCOUNT', 'Google Ads müşteri hesabı kimliği geçersiz.');
    const body: Record<string, unknown> = {
      query: 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign ORDER BY campaign.id',
      pageSize: 1000
    };
    if (cursor) body.pageToken = cursor;
    const response = await this.request<{ results?: unknown[]; nextPageToken?: unknown }>(
      context,
      `/customers/${providerAccountId}/googleAds:search`,
      { method: 'POST', body: JSON.stringify(body) }
    );
    const items = Array.isArray(response.results) ? response.results.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const campaign = (row as { campaign?: unknown }).campaign;
      if (!campaign || typeof campaign !== 'object') return [];
      const value = campaign as Record<string, unknown>;
      const id = typeof value.id === 'string' || typeof value.id === 'number' ? String(value.id) : '';
      if (!id) return [];
      return [{
        providerCampaignId: id,
        name: typeof value.name === 'string' ? value.name : 'Adsız kampanya',
        status: typeof value.status === 'string' ? value.status : 'UNKNOWN',
        objective: typeof value.advertisingChannelType === 'string' ? value.advertisingChannelType : null
      }];
    }) : [];
    const nextPageToken = typeof response.nextPageToken === 'string' && response.nextPageToken.length <= 2048
      ? response.nextPageToken
      : null;
    return { items, nextCursor: nextPageToken };
  }

  private oauthConfig(): OAuthConfig {
    const credentials = env.providers.GOOGLE_ADS;
    if (!credentials?.id || !credentials.secret) {
      throw new AdvertisingError('CONFIGURATION', 'Google Ads OAuth kimlik bilgileri yapılandırılmamış.', 503);
    }
    return {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: credentials.id,
      clientSecret: credentials.secret,
      scopes: ['https://www.googleapis.com/auth/adwords'],
      scopeSeparator: ' ',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' }
    };
  }

  private requireDeveloperToken() {
    if (!env.advertising.googleAds.developerToken) {
      throw new AdvertisingError('CONFIGURATION', 'Google Ads developer token yapılandırılmamış.', 503);
    }
  }

  private async readCustomer(context: AdvertisingAccessContext, id: string): Promise<ProviderAdAccount | null> {
    const response = await this.request<{ results?: unknown[] }>(
      context,
      `/customers/${id}/googleAds:search`,
      { method: 'POST', body: JSON.stringify({ query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status, customer.manager FROM customer LIMIT 1' }) }
    );
    const row = Array.isArray(response.results) ? response.results[0] : null;
    const customer = row && typeof row === 'object' && (row as { customer?: unknown }).customer;
    if (!customer || typeof customer !== 'object') return null;
    const value = customer as Record<string, unknown>;
    const customerId = typeof value.id === 'string' || typeof value.id === 'number' ? String(value.id) : id;
    return {
      providerAccountId: customerId,
      name: typeof value.descriptiveName === 'string' && value.descriptiveName.trim() ? value.descriptiveName : `Google Ads ${customerId}`,
      currency: typeof value.currencyCode === 'string' && value.currencyCode ? value.currencyCode : 'UNKNOWN',
      timezone: typeof value.timeZone === 'string' && value.timeZone ? value.timeZone : 'UNKNOWN',
      providerTimezone: typeof value.timeZone === 'string' && value.timeZone ? value.timeZone : null,
      status: typeof value.status === 'string' ? value.status : 'UNKNOWN',
      permissions: ['GOOGLE_ADS_READ']
    };
  }

  private async request<T>(context: AdvertisingAccessContext, path: string, init: RequestInit): Promise<T> {
    const apiVersion = env.advertising.googleAds.apiVersion.replace(/[^a-zA-Z0-9]/g, '');
    const url = `https://googleads.googleapis.com/${apiVersion}${path}`;
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${context.accessToken}`);
    headers.set('developer-token', env.advertising.googleAds.developerToken);
    const loginCustomerId = env.advertising.googleAds.loginCustomerId;
    if (loginCustomerId) headers.set('login-customer-id', loginCustomerId);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(20_000), redirect: 'error' });
    } catch {
      throw new AdvertisingError('PROVIDER_UNAVAILABLE', 'Google Ads şu anda yanıt vermiyor. Lütfen tekrar deneyin.', 502);
    }
    const text = await response.text();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new AdvertisingError('PROVIDER_AUTH', 'Google Ads yetkilendirmesi veya developer token geçersiz.', 502);
      }
      if (response.status === 429) {
        throw new AdvertisingError('RATE_LIMITED', 'Google Ads istek sınırına ulaşıldı. Lütfen biraz bekleyin.', 429);
      }
      throw new AdvertisingError('PROVIDER_ERROR', 'Google Ads hesapları doğrulanamadı. Lütfen yapılandırmayı kontrol edin.', 502);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AdvertisingError('PROVIDER_ERROR', 'Google Ads geçersiz bir yanıt döndürdü.', 502);
    }
  }
}
