'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, Modal, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import type { ProviderIntegrationDTO } from '@/lib/social/providerConfigService';

const STATUS_MAP: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand' }> = {
  READY: { label: 'Hazır (Canlı)', tone: 'success' },
  NOT_CONFIGURED: { label: 'Yapılandırılmadı', tone: 'neutral' },
  REVIEW_REQUIRED: { label: 'Platform Onayı Bekleniyor', tone: 'warning' },
  PARTIALLY_APPROVED: { label: 'Kısmen Onaylandı', tone: 'warning' },
  CONFIGURED: { label: 'Yapılandırıldı', tone: 'info' },
  ERROR: { label: 'Hata', tone: 'danger' }
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  NOT_CONFIGURED: 'Yapılandırılmadı',
  CONFIGURED: 'Geliştirici Modunda',
  REVIEW_REQUIRED: 'Uygulama İncelemesi Bekliyor',
  PARTIALLY_APPROVED: 'Kısmen Onaylandı (Sandbox/Test)',
  READY: 'Resmî Olarak Onaylandı (Canlı)',
  ERROR: 'İnceleme Reddedildi / Hata'
};

export function AdminIntegrationsView({
  initialItems
}: {
  initialItems: ProviderIntegrationDTO[];
}) {
  const toast = useToast();
  const [items, setItems] = useState<ProviderIntegrationDTO[]>(initialItems);
  const [editingItem, setEditingItem] = useState<ProviderIntegrationDTO | null>(null);
  const [verifyingProvider, setVerifyingProvider] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states for modal
  const [formData, setFormData] = useState({
    clientId: '',
    clientSecret: '',
    developerToken: '',
    apiVersion: '',
    environment: 'PRODUCTION',
    appReviewStatus: 'READY',
    writeEnabled: true,
    readEnabled: true,
    analyticsEnabled: true,
    adsEnabled: false,
    webhookUrl: '',
    webhookSecret: ''
  });

  const handleEdit = (item: ProviderIntegrationDTO) => {
    setEditingItem(item);
    setFormData({
      clientId: item.clientId || '',
      clientSecret: '',
      developerToken: '',
      apiVersion: item.apiVersion || '',
      environment: item.environment || 'PRODUCTION',
      appReviewStatus: item.appReviewStatus || 'READY',
      writeEnabled: item.writeEnabled,
      readEnabled: item.readEnabled,
      analyticsEnabled: item.analyticsEnabled,
      adsEnabled: item.adsEnabled,
      webhookUrl: item.webhookUrl || '',
      webhookSecret: ''
    });
  };

  const handleVerify = async (provider: string) => {
    setVerifyingProvider(provider);
    try {
      const res = await api.post<{ ok: boolean; status: string; message: string }>(
        `/api/v1/admin/integrations/${provider}/verify`
      );
      if (res.ok) {
        toast.success('Doğrulama Başarılı', res.message);
      } else {
        toast.warning('Eksik Yapılandırma', res.message);
      }
    } catch (err) {
      toast.error('Doğrulama Hatası', err instanceof ApiError ? err.message : 'Bağlantı doğrulanamadı.');
    } finally {
      setVerifyingProvider(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setSaving(true);
    try {
      await api.post('/api/v1/admin/integrations', {
        provider: editingItem.provider,
        clientId: formData.clientId.trim(),
        clientSecret: formData.clientSecret.trim() || undefined,
        developerToken: formData.developerToken.trim() || undefined,
        apiVersion: formData.apiVersion.trim() || undefined,
        environment: formData.environment,
        appReviewStatus: formData.appReviewStatus,
        writeEnabled: formData.writeEnabled,
        readEnabled: formData.readEnabled,
        analyticsEnabled: formData.analyticsEnabled,
        adsEnabled: formData.adsEnabled,
        webhookUrl: formData.webhookUrl.trim() || undefined,
        webhookSecret: formData.webhookSecret.trim() || undefined
      });

      toast.success('Kaydedildi', `${editingItem.name} entegrasyonu güncellendi.`);

      // Refresh list
      const refreshed = await api.get<{ items: ProviderIntegrationDTO[] }>('/api/v1/admin/integrations');
      setItems(refreshed.items);
      setEditingItem(null);
    } catch (err) {
      toast.error('Kayıt Başarısız', err instanceof ApiError ? err.message : 'Yapılandırma kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.info('Kopyalandı', `${label} panoya kopyalandı.`);
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">
              Platform Entegrasyon Yapılandırması
            </h1>
            <Badge tone="brand">Sistem / Admin</Badge>
          </div>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            SocialFlow resmi sağlayıcı geliştirici kimlikleri, OAuth API anahtarları, Webhook ve Uygulama İnceleme (App Review) ayarları.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            AES-256-GCM Şifreleme Aktif
          </span>
        </div>
      </div>

      {/* Grid of Providers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {items.map((item) => {
          const statusInfo = STATUS_MAP[item.status] || { label: item.status, tone: 'neutral' };
          const platformKey = item.provider === 'META' ? 'INSTAGRAM' : item.provider === 'GOOGLE' ? 'YOUTUBE' : item.provider;

          return (
            <div
              key={item.provider}
              className="card flex flex-col justify-between border border-border/80 bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <PlatformIcon platform={platformKey as any} size={42} rounded="lg" />
                    <div>
                      <h3 className="text-[15px] font-bold text-ink">{item.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                        <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-mono text-ink-muted">
                          {item.environment}
                        </span>
                        {item.apiVersion && (
                          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-mono text-ink-muted">
                            {item.apiVersion}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleEdit(item)}
                    className="btn-outline btn-sm inline-flex items-center gap-1.5"
                  >
                    <Icon name="sliders" size={14} />
                    Yapılandır
                  </button>
                </div>

                {/* Details Section */}
                <div className="mt-4 space-y-2 rounded-xl bg-surface-muted/50 p-3 text-[12.5px]">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">İstemci Kimliği (Client ID):</span>
                    <span className="font-mono font-medium text-ink">
                      {item.clientId ? `${item.clientId.slice(0, 14)}…` : <span className="text-ink-faint">Tanımlanmamış</span>}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Gizli Anahtar (Client Secret):</span>
                    <span className="font-mono text-ink">
                      {item.hasClientSecret ? (
                        <span className="text-emerald-600 font-semibold">{item.clientSecretMasked || '••••••••'} (Şifreli)</span>
                      ) : (
                        <span className="text-amber-600">Eksik</span>
                      )}
                    </span>
                  </div>

                  {item.provider === 'GOOGLE' && (
                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">Google Ads Developer Token:</span>
                      <span className="font-mono text-ink">
                        {item.hasDeveloperToken ? (
                          <span className="text-emerald-600 font-semibold">{item.developerTokenMasked || '••••••••'}</span>
                        ) : (
                          <span className="text-ink-faint">Yok (Yalnızca YouTube)</span>
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">App Review Durumu:</span>
                    <span className="font-medium text-ink">
                      {REVIEW_STATUS_LABELS[item.appReviewStatus] || item.appReviewStatus}
                    </span>
                  </div>

                  {item.redirectUri && (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                      <span className="text-ink-muted truncate">OAuth Redirect URI:</span>
                      <button
                        onClick={() => copyToClipboard(item.redirectUri!, 'OAuth Redirect URI')}
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-brand hover:underline shrink-0"
                      >
                        <Icon name="copy" size={12} />
                        Kopyala
                      </button>
                    </div>
                  )}
                </div>

                {/* Scopes & Capabilities */}
                <div className="mt-3 flex flex-wrap gap-1">
                  <span className={`chip ${item.writeEnabled ? 'chip-active' : 'opacity-50'}`}>
                    {item.writeEnabled ? '✓' : '✗'} Organik Paylaşım
                  </span>
                  <span className={`chip ${item.adsEnabled ? 'chip-active' : 'opacity-50'}`}>
                    {item.adsEnabled ? '✓' : '✗'} Reklam Yönetimi
                  </span>
                  <span className={`chip ${item.analyticsEnabled ? 'chip-active' : 'opacity-50'}`}>
                    {item.analyticsEnabled ? '✓' : '✗'} Analitik Senkronizasyonu
                  </span>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3">
                <span className="text-[11px] text-ink-muted">
                  {item.lastVerifiedAt
                    ? `Son doğrulama: ${new Date(item.lastVerifiedAt).toLocaleDateString('tr-TR')}`
                    : 'Henüz doğrulanmadı'}
                </span>
                <button
                  onClick={() => handleVerify(item.provider)}
                  disabled={verifyingProvider === item.provider || !item.clientId}
                  className="btn-ghost btn-sm inline-flex items-center gap-1.5 text-ink-muted hover:text-ink disabled:opacity-40"
                >
                  {verifyingProvider === item.provider ? (
                    <>
                      <Spinner size={13} />
                      Doğrulanıyor…
                    </>
                  ) : (
                    <>
                      <Icon name="check-circle" size={14} className="text-emerald-500" />
                      Doğrula
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <Modal
          open={Boolean(editingItem)}
          onClose={() => !saving && setEditingItem(null)}
          title={`${editingItem.name} Yapılandırması`}
          description="Resmî API sağlayıcı konsolundan aldığınız anahtarları girin. Gizli anahtarlar AES-256-GCM ile şifrelenir."
        >
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="label">Ortam (Environment)</label>
              <select
                className="input select"
                value={formData.environment}
                onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
              >
                <option value="PRODUCTION">Üretim (Canlı - Production)</option>
                <option value="SANDBOX">Geliştirici / Sandbox</option>
                <option value="DEVELOPMENT">Yerel Test (Development)</option>
              </select>
            </div>

            <div>
              <label className="label">İstemci Kimliği (Client ID / App ID)</label>
              <input
                type="text"
                required
                className="input font-mono"
                placeholder="Örn: 10485938592019"
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
              />
            </div>

            <div>
              <label className="label">
                Gizli Anahtar (Client Secret / App Secret)
                {editingItem.hasClientSecret && (
                  <span className="ml-2 font-normal text-emerald-600 text-[11.5px]">(Mevcut şifreli anahtar korunuyor)</span>
                )}
              </label>
              <input
                type="password"
                className="input font-mono"
                placeholder={editingItem.hasClientSecret ? 'Değiştirmek için yeni anahtar girin' : 'API Secret anahtarı'}
                value={formData.clientSecret}
                onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
              />
            </div>

            {editingItem.provider === 'GOOGLE' && (
              <div>
                <label className="label">
                  Google Ads Developer Token
                  <span className="ml-1 text-[11.5px] text-ink-muted">(Google Ads API için zorunlu)</span>
                </label>
                <input
                  type="password"
                  className="input font-mono"
                  placeholder={editingItem.hasDeveloperToken ? 'Mevcut token korunuyor' : 'Developer token girin'}
                  value={formData.developerToken}
                  onChange={(e) => setFormData({ ...formData, developerToken: e.target.value })}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">API Sürümü</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={formData.apiVersion}
                  onChange={(e) => setFormData({ ...formData, apiVersion: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Uygulama İnceleme (App Review)</label>
                <select
                  className="input select"
                  value={formData.appReviewStatus}
                  onChange={(e) => setFormData({ ...formData, appReviewStatus: e.target.value })}
                >
                  <option value="READY">Resmî Onaylandı (Canlı)</option>
                  <option value="REVIEW_REQUIRED">İnceleme Bekleniyor</option>
                  <option value="PARTIALLY_APPROVED">Kısmen Onaylandı</option>
                  <option value="CONFIGURED">Geliştirici Modunda</option>
                  <option value="NOT_CONFIGURED">Yapılandırılmadı</option>
                </select>
              </div>
            </div>

            <div className="border-t border-border/80 pt-3">
              <label className="label mb-2">Sağlayıcı Yetenekleri</label>
              <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.writeEnabled}
                    onChange={(e) => setFormData({ ...formData, writeEnabled: e.target.checked })}
                  />
                  <span>Organik Paylaşım (Publish)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.adsEnabled}
                    onChange={(e) => setFormData({ ...formData, adsEnabled: e.target.checked })}
                  />
                  <span>Reklam Yönetimi (Ads)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.analyticsEnabled}
                    onChange={(e) => setFormData({ ...formData, analyticsEnabled: e.target.checked })}
                  />
                  <span>Analitik / İstatistikler</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.readEnabled}
                    onChange={(e) => setFormData({ ...formData, readEnabled: e.target.checked })}
                  />
                  <span>Profil & Sayfa Okuma</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                className="btn-ghost btn-md"
                disabled={saving}
                onClick={() => setEditingItem(null)}
              >
                İptal
              </button>
              <button
                type="submit"
                className="btn-primary btn-md inline-flex items-center gap-1.5"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Spinner size={14} />
                    Kaydediliyor…
                  </>
                ) : (
                  <>
                    <Icon name="check" size={14} />
                    Kaydet ve Şifrele
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
