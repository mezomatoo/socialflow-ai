'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, EmptyState, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { PLATFORM_META, type PlatformCode } from '@/lib/platforms/platforms';

interface AccountItem {
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
  connectionResult
}: {
  items: AccountItem[];
  brands: { id: string; name: string }[];
  platforms: { code: string; name: string; color: string }[];
  demoMode: boolean;
  connectionResult?: string | null;
}) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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
        toast.info('Demo Modu bağlantısı', res.message ?? 'Hesap simülasyon olarak bağlı.');
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

  async function remove(a: AccountItem) {
    if (!window.confirm(`${a.displayName} (@${a.handle}) bağlantısı kaldırılsın mı?`)) return;
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
            Resmî OAuth ile bağlanan hesaplar. Parola veya oturum bilgisi asla istenmez ve saklanmaz.
          </p>
        </div>
        <button className="btn-primary btn-md" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={16} /> Hesap Bağla
        </button>
      </div>

      {connectionResult && <div role="status" className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">{connectionResult}</div>}

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
                          </div>
                          <p className="truncate text-[12.5px] text-ink-muted">
                            @{a.handle} · {ACCOUNT_TYPES[a.accountType] ?? a.accountType}
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
                        <div className="ml-auto flex items-center gap-1">
                          {(a.platform === 'INSTAGRAM' || a.connectionStatus !== 'ACTIVE') && (
                            <button className="btn-secondary btn-sm" disabled={busyId === a.id} onClick={() => connect(a)}>
                              <Icon name="refresh" size={13} /> Yeniden Bağla
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
          onClose={() => setAddOpen(false)}
          onCreated={(acc) => {
            setItems((prev) => [...prev, acc]);
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AddAccountModal({
  brands,
  platforms,
  demoMode,
  onClose,
  onCreated
}: {
  brands: { id: string; name: string }[];
  platforms: { code: string; name: string; color: string }[];
  demoMode: boolean;
  connectionResult?: string | null;
  onClose: () => void;
  onCreated: (acc: AccountItem) => void;
}) {
  const toast = useToast();
  const [platform, setPlatform] = useState(platforms[0]?.code ?? 'INSTAGRAM');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accountType, setAccountType] = useState('PROFILE');
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

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
      onCreated({
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
        tokenExpiresAt: null
      });
      toast.success('Hesap eklendi', res.demoAccount ? 'Demo hesabı olarak eklendi.' : 'Gerçek bağlantı için hesabın yetkilendirme düğmesini kullanın.');
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
            {saving ? 'Ekleniyor…' : 'Hesabı Ekle'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {demoMode && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-ink">
            Demo modunda hesaplar simülasyon olarak eklenir. Gerçek yayınlarda resmî OAuth akışı kullanılır.
          </p>
        )}
        <div>
          <label className="label">Platform</label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {platforms.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => setPlatform(p.code)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] font-medium transition-colors ${
                  platform === p.code ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-muted hover:bg-surface-subtle'
                }`}
              >
                <PlatformIcon platform={p.code} size={24} rounded="md" muted={platform !== p.code} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
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
