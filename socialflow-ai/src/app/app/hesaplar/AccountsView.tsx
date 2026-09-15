'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, EmptyState, Modal, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { formatRelative } from '@/lib/format';
import { PLATFORM_META, type PlatformCode } from '@/lib/platforms/platforms';
import type { DiscoveredAssetSummary } from '@/lib/social/assetDiscoveryService';

interface SocialAccountItem {
  id: string;
  platform: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  accountType: string;
  connectionStatus: string;
  demoAccount: boolean;
  lastError: string | null;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  externalId: string | null;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
}

interface AdAccountItem {
  id: string;
  provider: string;
  providerAccountId: string;
  displayName: string;
  currency: string | null;
  timezone: string | null;
  connectionStatus: string;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  tokenExpiresAt: string | null;
  lastValidatedAt: string | null;
}

interface ProviderStatus {
  code: string;
  name: string;
  isConfigured: boolean;
  appReviewStatus: string;
  writeEnabled: boolean;
  adsEnabled: boolean;
  status: string;
}

interface BrandOption {
  id: string;
  name: string;
  primaryColor?: string | null;
}

const STATUS_MAP: Record<string, { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  ACTIVE: { tone: 'success', label: 'Bağlı (Aktif)' },
  CONNECTED: { tone: 'success', label: 'Bağlı' },
  EXPIRED: { tone: 'warning', label: 'Süresi Doldu' },
  REVOKED: { tone: 'danger', label: 'Bağlantı Kesildi' },
  ERROR: { tone: 'danger', label: 'Hata' },
  NEEDS_REAUTH: { tone: 'warning', label: 'Yetkilendirme Gerekli' },
  UNVERIFIED: { tone: 'neutral', label: 'Doğrulanmadı' }
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  PROFILE: 'Kişisel Profil',
  PAGE: 'Sayfa',
  BUSINESS: 'İşletme Hesabı',
  CHANNEL: 'Kanal',
  GROUP: 'Grup'
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  ORGANIC_PAGE: 'Sayfa (Facebook/LinkedIn)',
  ORGANIC_PROFILE: 'Profil Hesabı',
  INSTAGRAM_BUSINESS: 'Instagram İşletme',
  YOUTUBE_CHANNEL: 'YouTube Kanalı',
  AD_ACCOUNT: 'Reklam Hesabı',
  PINTEREST_BOARD: 'Pinterest Panosu'
};

export function AccountsView({
  socialAccounts: initialSocial,
  adAccounts: initialAds,
  brands,
  providers,
  discoverySessionKey,
  connectionResult,
  errorMessage,
  demoMode
}: {
  socialAccounts: SocialAccountItem[];
  adAccounts: AdAccountItem[];
  brands: BrandOption[];
  providers: ProviderStatus[];
  discoverySessionKey?: string | null;
  connectionResult?: string | null;
  errorMessage?: string | null;
  demoMode: boolean;
}) {
  const toast = useToast();
  const [socials, setSocials] = useState<SocialAccountItem[]>(initialSocial);
  const [ads, setAds] = useState<AdAccountItem[]>(initialAds);
  const [activeTab, setActiveTab] = useState<'all' | 'social' | 'ads'>('all');

  // Permission consent modal state
  const [consentProvider, setConsentProvider] = useState<ProviderStatus | null>(null);
  const [connectionMode, setConnectionMode] = useState<'ALL' | 'ORGANIC' | 'ADS'>('ALL');
  const [startingOAuth, setStartingOAuth] = useState(false);

  // Asset discovery modal state
  const [discoveryKey, setDiscoveryKey] = useState<string | null>(discoverySessionKey ?? null);
  const [discoveredAssets, setDiscoveredAssets] = useState<DiscoveredAssetSummary[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedBrandMap, setSelectedBrandMap] = useState<Record<string, string>>({});
  const [importingAssetId, setImportingAssetId] = useState<string | null>(null);

  // Disconnect confirmation modal state
  const [disconnectingAccount, setDisconnectingAccount] = useState<{ id: string; name: string; type: 'social' | 'ad' } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Busy indicator for health checks
  const [busyId, setBusyId] = useState<string | null>(null);

  // On mount: if discovery session key is present, load assets
  useEffect(() => {
    if (discoveryKey) {
      loadDiscoveredAssets(discoveryKey);
    }
  }, [discoveryKey]);

  async function loadDiscoveredAssets(sessionKey: string) {
    setLoadingAssets(true);
    try {
      const res = await api.get<{ provider: string; items: DiscoveredAssetSummary[] }>(
        `/api/v1/accounts/oauth/discovered?session=${encodeURIComponent(sessionKey)}`
      );
      setDiscoveredAssets(res.items);
      // Pre-select first brand for all assets if available
      if (brands.length > 0) {
        const initialMap: Record<string, string> = {};
        res.items.forEach(a => { initialMap[a.id] = brands[0].id; });
        setSelectedBrandMap(initialMap);
      }
    } catch (err: any) {
      toast.error('Keşif Oturumu Yüklenemedi', err?.message || 'Keşfedilen hesaplar alınamadı.');
      setDiscoveryKey(null);
    } finally {
      setLoadingAssets(false);
    }
  }

  // Start OAuth Flow
  async function startOAuthFlow() {
    if (!consentProvider) return;
    setStartingOAuth(true);
    try {
      const res = await api.post<{ provider: string; authorizeUrl: string; state: string }>(
        '/api/v1/accounts/oauth/start',
        {
          provider: consentProvider.code,
          mode: connectionMode
        }
      );

      toast.info('Yönlendiriliyor', `${consentProvider.name} resmî giriş ekranına aktarılıyorsunuz…`);
      window.location.href = res.authorizeUrl;
    } catch (err: any) {
      toast.error('Bağlantı Başlatılamadı', err?.message || 'OAuth yönlendirme hatası.');
      setStartingOAuth(false);
    }
  }

  // Import Selected Discovered Asset
  async function handleImportAsset(asset: DiscoveredAssetSummary) {
    if (!discoveryKey) return;
    setImportingAssetId(asset.id);
    const chosenBrandId = selectedBrandMap[asset.id] || null;

    try {
      const res = await api.post<any>('/api/v1/accounts/oauth/import', {
        sessionKey: discoveryKey,
        assetId: asset.id,
        brandId: chosenBrandId
      });

      toast.success('Hesap Bağlandı', `${asset.name} başarıyla çalışma alanınıza eklendi.`);

      // Mark already connected in modal
      setDiscoveredAssets(prev => prev.map(a => a.id === asset.id ? { ...a, alreadyConnected: true } : a));

      // Reload accounts from API
      const accountsRes = await api.get<{ items: any[] }>('/api/v1/accounts');
      setSocials(accountsRes.items);
    } catch (err: any) {
      toast.error('İçe Aktarılamadı', err?.message || 'Hesap eklenirken bir hata oluştu.');
    } finally {
      setImportingAssetId(null);
    }
  }

  // Run Health Check on Social Account
  async function handleHealthCheck(account: SocialAccountItem) {
    setBusyId(account.id);
    try {
      const res = await api.post<{
        ok: boolean;
        connectionStatus: string;
        checks: { label: string; level: 'OK' | 'WARNING' | 'ERROR'; message: string }[];
      }>(`/api/v1/accounts/${account.id}/health`);

      const errors = res.checks.filter(c => c.level === 'ERROR');
      if (res.ok) {
        toast.success('Bağlantı Sağlıklı', `${account.displayName} bağlantısı sorunsuz doğrulandı.`);
      } else {
        toast.warning('Bağlantı Uyarısı', errors[0]?.message || 'Bağlantıda sorun tespit edildi.');
      }

      setSocials(prev =>
        prev.map(item =>
          item.id === account.id
            ? {
                ...item,
                connectionStatus: res.connectionStatus,
                lastSyncedAt: new Date().toISOString(),
                lastError: res.ok ? null : (errors[0]?.message || item.lastError)
              }
            : item
        )
      );
    } catch (err: any) {
      toast.error('Sağlık Denetimi Başarısız', err?.message || 'Kontrol yapılamadı.');
    } finally {
      setBusyId(null);
    }
  }

  // Update Brand Mapping for Social Account
  async function handleChangeBrand(accountId: string, brandId: string) {
    setBusyId(accountId);
    try {
      await api.patch(`/api/v1/accounts/${accountId}`, { brandId: brandId || null });
      const brand = brands.find(b => b.id === brandId);
      setSocials(prev =>
        prev.map(x =>
          x.id === accountId
            ? { ...x, brandId: brandId || null, brandName: brand?.name ?? null, brandColor: brand?.primaryColor ?? null }
            : x
        )
      );
      toast.success('Marka Güncellendi');
    } catch (err: any) {
      toast.error('Marka Güncellenemedi', err?.message || 'Hata oluştu.');
    } finally {
      setBusyId(null);
    }
  }

  // Disconnect Account
  async function confirmDisconnect() {
    if (!disconnectingAccount) return;
    setDisconnecting(true);
    try {
      if (disconnectingAccount.type === 'social') {
        await api.del(`/api/v1/accounts/${disconnectingAccount.id}`);
        setSocials(prev => prev.filter(x => x.id !== disconnectingAccount.id));
      } else {
        await api.del(`/api/v1/advertising/accounts/${disconnectingAccount.id}`);
        setAds(prev => prev.filter(x => x.id !== disconnectingAccount.id));
      }
      toast.success('Bağlantı Kesildi', `${disconnectingAccount.name} bağlantısı güvenle kaldırıldı.`);
      setDisconnectingAccount(null);
    } catch (err: any) {
      toast.error('Bağlantı Kesilemedi', err?.message || 'Hata oluştu.');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      {/* Page Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">
              Hesap Bağlantı Merkezi
            </h1>
            <Badge tone="success">Canlı Üretim Geçidi</Badge>
          </div>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Resmî sağlayıcı OAuth 2.0 akışı ile güvenli hesap bağlantısı. Sosyal medya parolanız asla istenmez ve saklanmaz.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-surface-muted p-1 text-[12.5px] font-medium text-ink-muted">
            <button
              onClick={() => setActiveTab('all')}
              className={`rounded-md px-3 py-1.5 transition-colors ${activeTab === 'all' ? 'bg-surface text-ink shadow-xs' : 'hover:text-ink'}`}
            >
              Tümü ({socials.length + ads.length})
            </button>
            <button
              onClick={() => setActiveTab('social')}
              className={`rounded-md px-3 py-1.5 transition-colors ${activeTab === 'social' ? 'bg-surface text-ink shadow-xs' : 'hover:text-ink'}`}
            >
              Organik ({socials.length})
            </button>
            <button
              onClick={() => setActiveTab('ads')}
              className={`rounded-md px-3 py-1.5 transition-colors ${activeTab === 'ads' ? 'bg-surface text-ink shadow-xs' : 'hover:text-ink'}`}
            >
              Reklamlar ({ads.length})
            </button>
          </div>
        </div>
      </div>

      {/* Connection Result Banners */}
      {connectionResult === 'reddedildi' && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <Icon name="alert-triangle" size={18} className="text-amber-600 shrink-0" />
            <span>Sağlayıcı yetkilendirmesi iptal edildi veya reddedildi. {errorMessage}</span>
          </div>
        </div>
      )}

      {connectionResult === 'gecersiz_state' && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-900 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <Icon name="alert-triangle" size={18} className="text-rose-600 shrink-0" />
            <span>Güvenlik doğrulaması zaman aşımına uğradı (CSRF State). Lütfen bağlantıyı tekrar başlatın.</span>
          </div>
        </div>
      )}

      {connectionResult === 'varlik_bulunamadi' && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <Icon name="alert-triangle" size={18} className="text-amber-600 shrink-0" />
            <span>Yetkilendirdiğiniz sağlayıcı hesabında bağlanabilecek uygun bir Sayfa, Kanal veya Reklam Hesabı bulunamadı. Lütfen sağlayıcı panelinde yönetici yetkinizi kontrol edin.</span>
          </div>
        </div>
      )}

      {/* Provider Cards Carousel / Grid */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink">Resmî Entegrasyon Sağlayıcıları</h2>
          <span className="text-[12px] text-ink-muted">Tek tıkla resmî giriş yapın</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {providers.map((p) => {
            const platformKey = p.code === 'META' ? 'INSTAGRAM' : p.code === 'GOOGLE' ? 'YOUTUBE' : p.code;
            return (
              <div
                key={p.code}
                className="card flex flex-col items-center justify-between p-3.5 text-center transition-all hover:border-brand/50 hover:shadow-xs"
              >
                <div className="flex flex-col items-center">
                  <PlatformIcon platform={platformKey as any} size={36} rounded="lg" />
                  <span className="mt-2 text-[12.5px] font-bold text-ink line-clamp-1">{p.name.split(' ')[0]}</span>
                  <span className="mt-0.5 text-[10.5px] text-ink-muted">
                    {p.isConfigured ? (
                      <span className="text-emerald-600 font-medium">✓ Hazır</span>
                    ) : (
                      <span className="text-ink-faint">Yapılandırılmadı</span>
                    )}
                  </span>
                </div>

                <button
                  onClick={() => setConsentProvider(p)}
                  disabled={!p.isConfigured}
                  className={`btn-sm mt-3 w-full text-[11.5px] font-semibold ${
                    p.isConfigured ? 'btn-primary' : 'btn-ghost opacity-40 cursor-not-allowed'
                  }`}
                >
                  Bağla
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Connected Accounts Section */}
      <div className="space-y-6">
        {/* Social Accounts */}
        {(activeTab === 'all' || activeTab === 'social') && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-ink">
                Bağlı Sosyal Medya Hesapları ({socials.length})
              </h3>
            </div>

            {socials.length === 0 ? (
              <div className="card p-6 text-center">
                <p className="text-[13px] text-ink-muted">
                  Henüz bağlı bir sosyal medya hesabınız bulunmuyor. Yukarıdaki sağlayıcılardan birini seçerek hemen bağlayabilirsiniz.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {socials.map((a) => {
                  const statusInfo = STATUS_MAP[a.connectionStatus] || { label: a.connectionStatus, tone: 'neutral' };
                  return (
                    <div key={a.id} className="card card-pad flex flex-col justify-between">
                      <div>
                        <div className="flex items-start gap-3">
                          <div className="relative shrink-0">
                            {a.avatarUrl ? (
                              <img
                                src={a.avatarUrl}
                                alt={a.displayName}
                                className="h-10 w-10 rounded-full object-cover border border-border"
                              />
                            ) : (
                              <PlatformIcon platform={a.platform as any} size={40} rounded="full" />
                            )}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${
                                statusInfo.tone === 'success'
                                  ? 'bg-emerald-500'
                                  : statusInfo.tone === 'warning'
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                              }`}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="truncate text-[14px] font-bold text-ink">{a.displayName}</h4>
                              <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                            </div>

                            <p className="truncate text-[12.5px] text-ink-muted">
                              {a.handle} · {ACCOUNT_TYPE_LABELS[a.accountType] || a.accountType}
                            </p>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-muted">
                              {a.brandName && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 font-medium text-ink">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ background: a.brandColor || '#94a3b8' }}
                                  />
                                  {a.brandName}
                                </span>
                              )}
                              {a.lastSyncedAt && (
                                <span>Son kontrol: {formatRelative(a.lastSyncedAt)}</span>
                              )}
                            </div>

                            {a.lastError && (
                              <p className="mt-1.5 text-[11.5px] text-rose-600 bg-rose-50 dark:bg-rose-950/30 rounded p-1">
                                {a.lastError}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom actions */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                        <select
                          className="input select h-8 py-0 text-[12px] max-w-[150px]"
                          value={a.brandId || ''}
                          disabled={busyId === a.id}
                          onChange={(e) => handleChangeBrand(a.id, e.target.value)}
                        >
                          <option value="">Marka Seçilmedi</option>
                          {brands.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleHealthCheck(a)}
                            disabled={busyId === a.id}
                            className="btn-outline btn-sm inline-flex items-center gap-1"
                            title="Bağlantı sağlığını denetle"
                          >
                            {busyId === a.id ? (
                              <Spinner size={12} />
                            ) : (
                              <Icon name="check-circle" size={13} className="text-emerald-500" />
                            )}
                            Test Et
                          </button>

                          <button
                            onClick={() => setDisconnectingAccount({ id: a.id, name: a.displayName, type: 'social' })}
                            className="btn-ghost btn-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            title="Bağlantıyı kaldır"
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Advertising Accounts */}
        {(activeTab === 'all' || activeTab === 'ads') && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-ink">
                Bağlı Reklam Hesapları ({ads.length})
              </h3>
            </div>

            {ads.length === 0 ? (
              <div className="card p-6 text-center">
                <p className="text-[13px] text-ink-muted">
                  Henüz bağlı bir reklam hesabınız bulunmuyor. Meta Ads veya Google Ads bağlamak için yukarıdaki kartlardan &ldquo;Hesap Bağla&rdquo; seçeneğini kullanın.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {ads.map((ad) => {
                  const statusInfo = STATUS_MAP[ad.connectionStatus] || { label: ad.connectionStatus, tone: 'neutral' };
                  return (
                    <div key={ad.id} className="card card-pad flex flex-col justify-between">
                      <div>
                        <div className="flex items-start gap-3">
                          <PlatformIcon platform={ad.provider === 'META' ? 'FACEBOOK' : (ad.provider as any)} size={38} rounded="lg" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="truncate text-[14px] font-bold text-ink">{ad.displayName}</h4>
                              <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                            </div>
                            <p className="font-mono text-[12px] text-ink-muted">
                              Hesap No: {ad.providerAccountId} · {ad.currency || 'USD'}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-[11.5px] text-ink-muted">
                              {ad.brandName && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 font-medium text-ink">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ background: ad.brandColor || '#94a3b8' }}
                                  />
                                  {ad.brandName}
                                </span>
                              )}
                              <span>Zaman Dilimi: {ad.timezone || 'Europe/Istanbul'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
                        <a
                          href="/app/reklamlar"
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
                        >
                          <Icon name="activity" size={13} /> Kampanyaları Görüntüle
                        </a>

                        <button
                          onClick={() => setDisconnectingAccount({ id: ad.id, name: ad.displayName, type: 'ad' })}
                          className="btn-ghost btn-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Permission Consent Modal */}
      {consentProvider && (
        <Modal
          open={Boolean(consentProvider)}
          onClose={() => !startingOAuth && setConsentProvider(null)}
          title={`${consentProvider.name} Bağlantısı`}
          description="SocialFlow, resmî OAuth 2.0 üzerinden yetkilendirme talep eder. Parolanız asla istenmez."
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-border/80 bg-surface-muted/50 p-4">
              <h4 className="text-[13px] font-bold text-ink mb-2">Talep Edilen Resmî İzinler</h4>
              <ul className="space-y-2 text-[12.5px] text-ink-muted">
                <li className="flex items-start gap-2">
                  <Icon name="check" size={15} className="text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>Organik Yayınlama:</strong> Gönderi, hikaye ve reels içeriklerinizi yayınlama ve planlama.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icon name="check" size={15} className="text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>Performans Analitiği:</strong> Beğeni, erişim ve etkileşim metriklerini okuma.</span>
                </li>
                {consentProvider.adsEnabled && (
                  <li className="flex items-start gap-2">
                    <Icon name="check" size={15} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span><strong>Reklam Yönetimi:</strong> Reklam hesaplarını bağlama ve mevcut gönderileri reklama dönüştürme.</span>
                  </li>
                )}
              </ul>
            </div>

            {consentProvider.adsEnabled && (
              <div>
                <label className="label">Bağlantı Modu</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setConnectionMode('ALL')}
                    className={`rounded-xl border p-2.5 text-center text-[12px] font-medium transition-all ${
                      connectionMode === 'ALL'
                        ? 'border-brand bg-brand-50/50 dark:bg-brand-950/30 text-brand font-bold'
                        : 'border-border text-ink-muted hover:border-border-strong'
                    }`}
                  >
                    Tümü (Organik + Reklam)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConnectionMode('ORGANIC')}
                    className={`rounded-xl border p-2.5 text-center text-[12px] font-medium transition-all ${
                      connectionMode === 'ORGANIC'
                        ? 'border-brand bg-brand-50/50 dark:bg-brand-950/30 text-brand font-bold'
                        : 'border-border text-ink-muted hover:border-border-strong'
                    }`}
                  >
                    Yalnızca Organik
                  </button>
                  <button
                    type="button"
                    onClick={() => setConnectionMode('ADS')}
                    className={`rounded-xl border p-2.5 text-center text-[12px] font-medium transition-all ${
                      connectionMode === 'ADS'
                        ? 'border-brand bg-brand-50/50 dark:bg-brand-950/30 text-brand font-bold'
                        : 'border-border text-ink-muted hover:border-border-strong'
                    }`}
                  >
                    Yalnızca Reklam
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                className="btn-ghost btn-md"
                disabled={startingOAuth}
                onClick={() => setConsentProvider(null)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="btn-primary btn-md inline-flex items-center gap-1.5"
                disabled={startingOAuth}
                onClick={startOAuthFlow}
              >
                {startingOAuth ? (
                  <>
                    <Spinner size={14} />
                    Yönlendiriliyor…
                  </>
                ) : (
                  <>
                    <Icon name="link" size={14} />
                    Resmî Girişe Devam Et
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Asset Discovery & Selection Modal */}
      {discoveryKey && (
        <Modal
          open={Boolean(discoveryKey)}
          onClose={() => setDiscoveryKey(null)}
          title="Keşfedilen Hesaplar ve Varlıklar"
          description="Erişim yetkiniz olan sayfalar ve reklam hesapları bulundu. SocialFlow'a bağlamak istediklerinizi seçin."
        >
          {loadingAssets ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Spinner size={28} />
              <p className="text-[13px] text-ink-muted">Sağlayıcı hesabınızdaki varlıklar taranıyor…</p>
            </div>
          ) : discoveredAssets.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-ink-muted">
              Bağlanabilir bir varlık bulunamadı.
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {discoveredAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-xl border border-border/80 bg-surface p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {asset.avatarUrl ? (
                      <img
                        src={asset.avatarUrl}
                        alt={asset.name}
                        className="h-10 w-10 rounded-full object-cover shrink-0 border border-border"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-surface-muted flex items-center justify-center shrink-0">
                        <Icon name="users" size={18} className="text-ink-muted" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13.5px] font-bold text-ink truncate">{asset.name}</p>
                        <Badge tone="neutral">{ASSET_TYPE_LABELS[asset.type] || asset.type}</Badge>
                      </div>
                      <p className="text-[12px] text-ink-muted truncate">
                        {asset.handle || `ID: ${asset.externalId}`}
                        {asset.currency ? ` · ${asset.currency}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!asset.alreadyConnected && (
                      <select
                        className="input select h-8 py-0 text-[12px]"
                        value={selectedBrandMap[asset.id] || ''}
                        onChange={(e) => setSelectedBrandMap({ ...selectedBrandMap, [asset.id]: e.target.value })}
                      >
                        <option value="">Marka Seçin</option>
                        {brands.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    )}

                    <button
                      disabled={asset.alreadyConnected || importingAssetId === asset.id}
                      onClick={() => handleImportAsset(asset)}
                      className={`btn-sm ${
                        asset.alreadyConnected
                          ? 'btn-ghost text-emerald-600 cursor-default'
                          : 'btn-primary'
                      }`}
                    >
                      {importingAssetId === asset.id ? (
                        <>
                          <Spinner size={12} />
                          Bağlanıyor…
                        </>
                      ) : asset.alreadyConnected ? (
                        '✓ Bağlandı'
                      ) : (
                        'Hesabı Bağla'
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end border-t border-border pt-4 mt-4">
            <button
              type="button"
              className="btn-primary btn-md"
              onClick={() => setDiscoveryKey(null)}
            >
              Tamamla
            </button>
          </div>
        </Modal>
      )}

      {/* Disconnect Confirmation Modal */}
      {disconnectingAccount && (
        <Modal
          open={Boolean(disconnectingAccount)}
          onClose={() => !disconnecting && setDisconnectingAccount(null)}
          title="Bağlantıyı Kaldır"
          description={`${disconnectingAccount.name} bağlantısını kaldırmak istediğinizden emin misiniz?`}
        >
          <div className="space-y-3">
            <p className="text-[13px] text-ink-muted">
              Hesabın erişim anahtarları sistemden tamamen silinecek ve otomatik paylaşımlar durdurulacaktır. Mevcut yayın geçmişiniz ve raporlarınız korunur.
            </p>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                className="btn-ghost btn-md"
                disabled={disconnecting}
                onClick={() => setDisconnectingAccount(null)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="btn-danger btn-md inline-flex items-center gap-1.5"
                disabled={disconnecting}
                onClick={confirmDisconnect}
              >
                {disconnecting ? (
                  <>
                    <Spinner size={14} />
                    Kaldırılıyor…
                  </>
                ) : (
                  <>
                    <Icon name="trash" size={14} />
                    Bağlantıyı Kaldır
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
