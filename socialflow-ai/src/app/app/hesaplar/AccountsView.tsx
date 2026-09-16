'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, EmptyState, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { formatRelative } from '@/lib/format';
import { PLATFORM_META, type PlatformCode } from '@/lib/platforms/platforms';
import { SocialAccountPrivacyModal } from '@/components/SocialAccountPrivacyModal';

interface AccountItem {
  id: string;
  platform: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  accountType: string;
  connectionStatus: string;
  demoAccount: boolean;
  publishMode?: string;
  lastError: string | null;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  externalId: string | null;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
}

const STATUS: Record<string, { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  ACTIVE: { tone: 'success', label: 'Bağlı' },
  EXPIRED: { tone: 'warning', label: 'Süresi Doldu' },
  REVOKED: { tone: 'danger', label: 'Bağlantı Kesildi' },
  ERROR: { tone: 'danger', label: 'Hata' },
  NEEDS_REAUTH: { tone: 'warning', label: 'Yetkilendirme Gerekli' }
};

const ACCOUNT_TYPES: Record<string, string> = {
  PROFILE: 'Profil',
  PAGE: 'Sayfa',
  BUSINESS: 'İşletme',
  GROUP: 'Grup'
};

export function AccountsView({
  items: initial,
  brands,
  platforms,
  demoMode,
  connectionResult,
  connectionResultCode
}: {
  items: AccountItem[];
  brands: { id: string; name: string }[];
  platforms: { code: string; name: string; color: string }[];
  demoMode: boolean;
  connectionResult?: string | null;
  connectionResultCode?: string | null;
}) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [credentialsByPlatform, setCredentialsByPlatform] = useState<Record<string, boolean>>({});
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // Platform kimliklerinin tanımlı olup olmadığını bilmek, “Hesap Bağla”
  // akışında kullanıcıya doğru rehberliği göstermek için.
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: { platform: string; credentialsSet: boolean }[] }>('/api/settings/integrations')
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        for (const it of res.items) map[it.platform] = Boolean(it.credentialsSet);
        setCredentialsByPlatform(map);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, AccountItem[]>();
    for (const p of platforms) map.set(p.code, []);
    for (const a of items) {
      if (!map.has(a.platform)) map.set(a.platform, []);
      map.get(a.platform)!.push(a);
    }
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  }, [items, platforms]);

  async function connect(a: AccountItem) {
    setBusyId(a.id);
    try {
      const res = await api.post<{ demo: boolean; authorizeUrl: string | null; message?: string }>(
        `/api/accounts/${a.id}/connect`
      );
      if (res.demo) {
        toast.info('Bağlantı tamamlandı', res.message ?? 'Hesap bağlandı.');
        setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, connectionStatus: 'ACTIVE', lastError: null } : x)));
      } else if (res.authorizeUrl) {
        toast.success('Yetkilendirme başlatılıyor', 'Resmî OAuth sayfasına yönlendiriliyorsunuz.');
        window.location.href = res.authorizeUrl;
        return;
      }
    } catch (e) {
      toast.error('Bağlanamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusyId(null);
    }
  }

  /** OAuth tamamlanamadığında bilinçli simülasyon bağlantısı (içerik akışı kesilmez). */
  async function simulateConnect(a: AccountItem) {
    setBusyId(a.id);
    try {
      const res = await api.post<{ demo: boolean; message?: string }>(`/api/accounts/${a.id}/connect?simulate=1`);
      setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, connectionStatus: 'ACTIVE', lastError: null } : x)));
      toast.success('Simülasyon bağlantısı tamamlandı', res.message ?? `${a.displayName} artık kullanılabilir.`);
    } catch (e) {
      toast.error('Bağlanamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusyId(null);
    }
  }

  async function runHealthCheck(a: AccountItem) {
    setBusyId(a.id);
    try {
      const res = await api.post<{ ok: boolean; connectionStatus: string; checks: { label: string; level: 'OK' | 'WARNING' | 'ERROR'; message: string }[] }>(
        `/api/accounts/${a.id}/health`
      );
      const problems = res.checks.filter((c) => c.level === 'ERROR');
      if (res.ok) {
        toast.success('Bağlantı sağlıklı', problems.length ? problems[0].message : `${res.checks.length} kontrol tamamlandı, sorun bulunamadı.`);
      } else {
        toast.error('Bağlantı sorunu bulundu', problems[0]?.message ?? 'Bağlantı doğrulanamadı.');
      }
      setItems((prev) =>
        prev.map((x) =>
          x.id === a.id
            ? {
                ...x,
                connectionStatus: res.connectionStatus,
                lastSyncedAt: new Date().toISOString(),
                lastError: res.ok ? null : problems[0]?.message ?? x.lastError
              }
            : x
        )
      );
    } catch (e) {
      toast.error('Sağlık denetimi başarısız', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusyId(null);
    }
  }

  async function changeBrand(a: AccountItem, brandId: string) {
    setBusyId(a.id);
    try {
      await api.patch(`/api/accounts/${a.id}`, { brandId: brandId || null });
      const brand = brands.find((b) => b.id === brandId);
      setItems((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, brandId: brandId || null, brandName: brand?.name ?? null } : x))
      );
      toast.success('Marka ataması güncellendi');
    } catch (e) {
      toast.error('Güncellenemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusyId(null);
    }
  }

  /** Yayın modu: Otomatik (OAuth/API) veya Manuel (API'siz, elle yayınlama). */
  async function changePublishMode(a: AccountItem, mode: string) {
    setBusyId(a.id);
    try {
      await api.patch(`/api/accounts/${a.id}`, { publishMode: mode });
      setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, publishMode: mode } : x)));
      toast.success(
        mode === 'MANUAL' ? 'Manuel Yayın açıldı' : 'Otomatik yayına geçildi',
        mode === 'MANUAL'
          ? 'Bu hesap için API gerekmez: yayınlarken içeriği kopyalar, platformda paylaşır ve onaylarsınız.'
          : 'Bu hesap artık kimlikler tanımlıysa resmî API üzerinden otomatik yayınlar.'
      );
    } catch (e) {
      toast.error('Güncellenemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a: AccountItem) {
    if (!window.confirm(`${a.displayName} (@${a.handle.replace(/^@/, '')}) bağlantısı kaldırılsın mı?`)) return;
    setBusyId(a.id);
    try {
      await api.del(`/api/accounts/${a.id}`);
      setItems((prev) => prev.filter((x) => x.id !== a.id));
      toast.success('Hesap bağlantısı kaldırıldı');
    } catch (e) {
      toast.error('Kaldırılamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Sosyal Medya Hesapları</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Resmî OAuth ile bağlanır: parolanızı platformun kendi ekranına yazarsınız, bize asla gelmez.{' '}
            <button className="link font-semibold" onClick={() => setPrivacyOpen(true)}>
              Parola ve KVKK politikası
            </button>
          </p>
        </div>
        <button className="btn-primary btn-md" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={16} /> Hesap Bağla
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-surface-subtle px-4 py-3 text-[12.5px] text-ink-muted">
        <Icon name="info" size={15} className="shrink-0 text-info" />
        <span>
          Burada <strong className="text-ink">kendi hesaplarınızı</strong> bağlarsınız. Platform kimlikleri (App ID /
          Secret) ise yönetici tarafından{' '}
          <a href="/app/ayarlar?tab=entegrasyonlar" className="link font-semibold">
            Ayarlar → Entegrasyonlar
          </a>
          ’da bir kez tanımlanır; kimlik tanımlıysa bağlama tek tıkla olur.
        </span>
      </div>

      {connectionResult && (
        <div
          role="status"
          className={`mb-4 rounded-xl border p-4 text-sm ${
            connectionResultCode === 'connected'
              ? 'border-success/30 bg-success/10 text-ink'
              : 'border-warning/40 bg-warning/10 text-ink'
          }`}
        >
          <p className="font-semibold">{connectionResult}</p>
          {connectionResultCode && connectionResultCode !== 'connected' && connectionResultCode !== 'denied' && (
            <p className="mt-1.5 text-[12.5px] leading-relaxed opacity-90">
              Bu adım, sunucunun platforma doğrudan erişebildiği gerçek bir alan adında otomatik tamamlanır. Bu
              önizleme ortamında dış ağ erişimi olmadığından, beklemek istemiyorsanız aşağıdaki hesap kartlarında
              yer alan <strong>“Simülasyon Olarak Bağla”</strong> düğmesini kullanabilirsiniz; içerik planlama ve
              üretimi aynen çalışır.
            </p>
          )}
        </div>
      )}

      {demoMode && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[12.5px] text-ink">
          <span className="mt-0.5 text-warning">
            <Icon name="alert-triangle" size={16} />
          </span>
          <p>
            <strong>Demo Modu etkin.</strong> Aşağıdaki hesaplar simülasyondur; gerçek sosyal medya paylaşımı yapılmaz.
            Gerçek bağlantı için Ayarlar → Entegrasyonlar bölümünden resmî API kimlik bilgilerinizi tanımlayın.
          </p>
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="card p-6">
          <EmptyState
            icon="users"
            title="Bağlı hesap yok"
            description="Yayınlama yapabilmek için en az bir sosyal medya hesabı bağlayın."
            action={
              <button className="btn-primary btn-md" onClick={() => setAddOpen(true)}>
                <Icon name="plus" size={15} /> Hesap Bağla
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([platform, list]) => (
            <section key={platform}>
              <div className="mb-2 flex items-center gap-2">
                <PlatformIcon platform={platform} size={20} rounded="md" />
                <h2 className="text-[14px] font-bold text-ink">{PLATFORM_META[platform as PlatformCode]?.name ?? platform}</h2>
                <span className="hint">{list.length} hesap</span>
              </div>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {list.map((a) => {
                  const st = STATUS[a.connectionStatus] ?? { tone: 'neutral' as const, label: a.connectionStatus };
                  return (
                    <li key={a.id} className="card card-pad">
                      <div className="flex items-start gap-3">
                        <span className="relative">
                          <PlatformIcon platform={a.platform} size={40} rounded="lg" />
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface"
                            style={{
                              background:
                                st.tone === 'success'
                                  ? 'var(--success)'
                                  : st.tone === 'warning'
                                    ? 'var(--warning)'
                                    : st.tone === 'danger'
                                      ? 'var(--danger)'
                                      : '#94a3b8'
                            }}
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[14px] font-bold text-ink">{a.displayName}</p>
                            {a.demoAccount && <Badge tone="warning">Demo</Badge>}
                            {a.publishMode === 'MANUAL' && <Badge tone="neutral">API'siz Yayın</Badge>}
                          </div>
                          <p className="truncate text-[12.5px] text-ink-muted">
                            @{a.handle.replace(/^@/, '')} · {ACCOUNT_TYPES[a.accountType] ?? a.accountType}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <Badge tone={st.tone}>{st.label}</Badge>
                            {a.brandName && (
                              <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-faint">
                                <span className="h-2 w-2 rounded-full" style={{ background: a.brandColor ?? '#94a3b8' }} />
                                {a.brandName}
                              </span>
                            )}
                          </div>
                          {a.lastError && (
                            <p className="mt-1.5 text-[11.5px] text-danger">{a.lastError}</p>
                          )}
                          {a.lastSyncedAt && (
                            <p className="mt-1 text-[11px] text-ink-faint">Son eşitleme: {formatRelative(a.lastSyncedAt)}</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                        <select
                          className="select h-8 w-auto min-w-[130px] py-0 text-[12px]"
                          value={a.brandId ?? ''}
                          disabled={busyId === a.id}
                          onChange={(e) => changeBrand(a, e.target.value)}
                        >
                          <option value="">Marka atamadım</option>
                          {brands.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                        <select
                          className="select h-8 w-auto min-w-[150px] py-0 text-[12px]"
                          value={a.publishMode ?? 'AUTO'}
                          disabled={busyId === a.id}
                          onChange={(e) => changePublishMode(a, e.target.value)}
                          title="Otomatik: resmî API/OAuth ile yayınlanır (kimlik gerekir). Manuel: API'siz; içeriği kopyalar, platformda kendiniz paylaşır ve onaylarsınız."
                        >
                          <option value="AUTO">Yayın: Otomatik (API)</option>
                          <option value="MANUAL">Yayın: Manuel (API'siz)</option>
                        </select>
                        <div className="ml-auto flex items-center gap-1">
                          <button className="btn-secondary btn-sm" disabled={busyId === a.id} onClick={() => runHealthCheck(a)} title="Bağlantı sağlığını denetle">
                            <Icon name="shield" size={13} /> Bağlantıyı Test Et
                          </button>
                          {(a.platform === 'INSTAGRAM' || a.connectionStatus !== 'ACTIVE') && (
                            <button className="btn-secondary btn-sm" disabled={busyId === a.id} onClick={() => connect(a)}>
                              <Icon name="refresh" size={13} /> {a.connectionStatus === 'ACTIVE' ? 'Yeniden Yetkilendir' : 'Yetkilendir'}
                            </button>
                          )}
                          {a.connectionStatus !== 'ACTIVE' && (
                            <button
                              className="btn-ghost btn-sm"
                              disabled={busyId === a.id}
                              onClick={() => simulateConnect(a)}
                              title="OAuth onayını beklemeden simülasyon olarak bağla"
                            >
                              <Icon name="zap" size={13} /> Simülasyon Olarak Bağla
                            </button>
                          )}
                          <button className="btn-ghost btn-sm" title="Bağlantıyı kaldır" disabled={busyId === a.id} onClick={() => remove(a)}>
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {addOpen && (
        <AddAccountModal
          brands={brands}
          platforms={platforms}
          demoMode={demoMode}
          credentialsByPlatform={credentialsByPlatform}
          onOpenPrivacy={() => setPrivacyOpen(true)}
          onClose={() => setAddOpen(false)}
          onCreated={(acc, status) => {
            setItems((prev) => [...prev, status ? { ...acc, connectionStatus: status } : acc]);
            setAddOpen(false);
          }}
        />
      )}

      <SocialAccountPrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  );
}

function AddAccountModal({
  brands,
  platforms,
  demoMode,
  credentialsByPlatform,
  onOpenPrivacy,
  onClose,
  onCreated
}: {
  brands: { id: string; name: string }[];
  platforms: { code: string; name: string; color: string }[];
  demoMode: boolean;
  credentialsByPlatform: Record<string, boolean>;
  onOpenPrivacy: () => void;
  onClose: () => void;
  onCreated: (acc: AccountItem, statusOverride?: string) => void;
}) {
  const toast = useToast();
  const [platform, setPlatform] = useState(platforms[0]?.code ?? 'INSTAGRAM');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accountType, setAccountType] = useState('PROFILE');
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  const platformName = platforms.find((p) => p.code === platform)?.name ?? platform;
  const credsReady = credentialsByPlatform[platform] === true;
  const simulate = demoMode || !credsReady;

  async function submit() {
    if (!handle.trim()) {
      toast.error('Kullanıcı adı gerekli', 'Bağlanacak hesabın kullanıcı adını girin.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{ id: string; handle: string; demoAccount: boolean; connectionStatus: string }>('/api/accounts', {
        platform,
        handle: handle.trim().replace(/^@/, ''),
        displayName: displayName.trim() || handle.trim().replace(/^@/, ''),
        accountType,
        brandId: brandId || null,
        demoAccount: demoMode
      });
      const brand = brands.find((b) => b.id === brandId);
      const acc: AccountItem = {
        id: res.id,
        platform,
        handle: res.handle,
        displayName: displayName.trim() || handle.trim().replace(/^@/, ''),
        avatarUrl: null,
        accountType,
        connectionStatus: res.connectionStatus,
        demoAccount: res.demoAccount,
        lastError: null,
        brandId: brandId || null,
        brandName: brand?.name ?? null,
        brandColor: null,
        externalId: null,
        tokenExpiresAt: null,
        lastSyncedAt: null
      };

      // Kimlikler tanımlıysa ek adım yok: doğrudan platformun giriş ekranına git.
      if (!simulate) {
        try {
          const conn = await api.post<{ demo: boolean; authorizeUrl: string | null; message?: string }>(
            `/api/accounts/${res.id}/connect`
          );
          if (!conn.demo && conn.authorizeUrl) {
            toast.success('Yetkilendirme başlatılıyor', `${platformName} giriş ekranına yönlendiriliyorsunuz.`);
            onCreated(acc);
            window.location.href = conn.authorizeUrl;
            return;
          }
        } catch (e) {
          toast.error('OAuth başlatılamadı', e instanceof ApiError ? e.message : 'Hesap eklendi; “Yetkilendir” düğmesini deneyin.');
        }
        onCreated(acc);
        toast.info('Hesap eklendi', 'Bağlantı hemen başlatılamadı; listedeki “Yetkilendir” düğmesini kullanabilirsiniz.');
        return;
      }

      // Kimlik yoksa: simülasyon bağlantısını hemen tamamla, hesap anında kullanılabilir olsun.
      let statusOverride: string | undefined;
      try {
        const conn = await api.post<{ demo: boolean; authorizeUrl: string | null }>(`/api/accounts/${res.id}/connect`);
        if (conn.demo) statusOverride = 'ACTIVE';
      } catch {
        // Simülasyon bile başarısız olursa hesap eklendi olarak kalır.
      }
      onCreated(acc, statusOverride);
      toast.success(
        'Hesap eklendi (simülasyon)',
        `${platformName} için API kimliği tanımlı olmadığından hesap simülasyon olarak bağlandı; gerçek yayınlama yapılmaz. Gerçek bağlantı için yönetici Ayarlar → Entegrasyonlar bölümünden kimlik tanımlamalıdır.`
      );
    } catch (e) {
      toast.error('Eklenemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Hesap Bağla"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary btn-md" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-primary btn-md" onClick={submit} disabled={saving}>
            {saving ? 'Bağlanıyor…' : simulate ? 'Hesabı Ekle (Simülasyon)' : `${platformName} ile Bağlan`}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Platform</label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {platforms.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => setPlatform(p.code)}
                className={`relative flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] font-medium transition-colors ${
                  platform === p.code ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-muted hover:bg-surface-subtle'
                }`}
              >
                <span
                  className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
                  title={credentialsByPlatform[p.code] ? 'Kimlik tanımlı — gerçek bağlantı hazır' : 'Kimlik tanımlı değil'}
                  style={{ background: credentialsByPlatform[p.code] ? 'var(--success)' : '#cbd5e1' }}
                />
                <PlatformIcon platform={p.code} size={24} rounded="md" muted={platform !== p.code} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {simulate && !demoMode && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink">
            <Icon name="alert-triangle" size={15} className="mt-0.5 shrink-0 text-warning" />
            <p>
              <strong>{platformName} kimliği henüz tanımlı değil.</strong> Hesap simülasyon olarak bağlanır; planlama
              ve içerik üretimi çalışır ama gerçek paylaşım yapılmaz. Gerçek bağlantı için yöneticinin{' '}
              <a href="/app/ayarlar?tab=entegrasyonlar" className="link font-semibold" onClick={onClose}>
                Ayarlar → Entegrasyonlar
              </a>
              ’dan kimlik tanımlaması yeterlidir. Parolanız bu süreçte de asla istenmez ve saklanmaz.
            </p>
          </div>
        )}
        {credsReady && !demoMode && (
          <div className="space-y-2 rounded-xl border border-success/30 bg-success/10 p-3.5">
            <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
              <Icon name="check-circle" size={15} className="shrink-0 text-success" />
              {platformName} ile 4 adımda bağlanın
            </p>
            <ol className="space-y-1 pl-1">
              {[
                `“${platformName} ile Bağlan” düğmesine basın.`,
                `${platformName}’ın kendi resmî giriş ekranı açılır.`,
                'Kullanıcı adınızı ve parolanızı yalnızca o ekrana yazın.',
                'İzinleri onaylayın — hesabınız bağlanır.'
              ].map((step, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-ink">
                  <span className="mt-0.5 shrink-0 font-mono text-[11px] font-bold text-success">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="flex items-start gap-1.5 text-[11.5px] text-ink-faint">
              <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
              <span>
                Parolanız bize asla iletilmez ve saklanmaz.{' '}
                <button type="button" className="link font-semibold" onClick={onOpenPrivacy}>
                  KVKK ve parola politikası
                </button>
              </span>
            </p>
          </div>
        )}
        {demoMode && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-ink">
            Demo modunda hesaplar simülasyon olarak eklenir. Gerçek yayınlarda resmî OAuth akışı kullanılır.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Kullanıcı adı</label>
            <input className="input" placeholder="ornekmarka" value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <div>
            <label className="label">Görünen ad</label>
            <input className="input" placeholder="Örnek Marka" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="label">Hesap türü</label>
            <select className="select" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
              <option value="PROFILE">Profil</option>
              <option value="PAGE">Sayfa</option>
              <option value="BUSINESS">İşletme</option>
            </select>
          </div>
          <div>
            <label className="label">Marka</label>
            <select className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">Atamadım</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}
