import { AdvertisingError, noAdCapabilities, type AdvertisingProviderAdapter, type AdProviderInfo, type AdvertisingAccessContext } from './contracts';
/** Provider directory only, NOT seven live integrations. Implement Meta vertically first. */
const DIRECTORY = [
  { code: 'META', name: 'Meta Ads', placementsLabel: 'Facebook · Instagram · Meta yerleşimleri', color: '#2563eb' },
  { code: 'GOOGLE', name: 'Google Ads', placementsLabel: 'Google · YouTube', color: '#4285f4' },
  { code: 'LINKEDIN', name: 'LinkedIn Ads', placementsLabel: 'LinkedIn', color: '#0a66c2' },
  { code: 'TIKTOK', name: 'TikTok Ads', placementsLabel: 'TikTok', color: '#111827' },
  { code: 'X', name: 'X Ads', placementsLabel: 'X', color: '#111827' },
  { code: 'PINTEREST', name: 'Pinterest Ads', placementsLabel: 'Pinterest', color: '#bd081c' },
  { code: 'SNAPCHAT', name: 'Snapchat Ads', placementsLabel: 'Snapchat', color: '#854d0e' }
] as const;
export class UnavailableAdvertisingProvider implements AdvertisingProviderAdapter {
  readonly info: AdProviderInfo;
  constructor(info: Omit<AdProviderInfo, 'implementation' | 'apiVersion'>) {
    this.info = Object.freeze({ ...info, implementation: 'NOT_IMPLEMENTED', apiVersion: null });
  }
  getCapabilities() { return noAdCapabilities(); }
  async readAdAccounts(_context: AdvertisingAccessContext): Promise<never> { throw this.unavailable(); }
  async readCampaigns(_context: AdvertisingAccessContext, _providerAccountId: string): Promise<never> { throw this.unavailable(); }
  private unavailable() {
    return new AdvertisingError('API_LIMITATION', 'API KISITLAMASI — Bu reklam sağlayıcısının bağlantısı bu sürümde henüz etkin değil.', 422);
  }
}
export function createAdvertisingRegistry(adapters: AdvertisingProviderAdapter[]) {
  const entries = new Map<string, AdvertisingProviderAdapter>();
  for (const adapter of adapters) {
    if (!/^[A-Z][A-Z0-9_]{0,39}$/.test(adapter.info.code) || entries.has(adapter.info.code)) throw new Error('Reklam sağlayıcı kodu geçersiz veya tekrar ediyor.');
    entries.set(adapter.info.code, adapter);
  }
  return {
    list: () => [...entries.values()],
    get(code: string) {
      const adapter = entries.get(code);
      if (!adapter) throw new AdvertisingError('UNKNOWN_PROVIDER', 'Reklam sağlayıcısı bulunamadı.', 404);
      return adapter;
    }
  };
}
export const advertisingRegistry = createAdvertisingRegistry(DIRECTORY.map(info => new UnavailableAdvertisingProvider(info)));
