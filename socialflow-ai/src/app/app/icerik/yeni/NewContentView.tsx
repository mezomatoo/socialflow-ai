'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { charLength } from '@/lib/text';
import { formatBytes } from '@/lib/format';
import { CONTENT_STYLE_LABELS } from '@/lib/platforms/platforms';

interface Brand {
  id: string;
  name: string;
  primaryColor: string;
  defaultStyle: string;
  defaultCta: string | null;
  website: string | null;
}
interface Account {
  id: string;
  platform: string;
  handle: string;
  displayName: string;
  demoAccount: boolean;
  accountType: string;
}
interface Media {
  id: string;
  kind: string;
  originalName: string;
  publicUrl: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
}
interface Platform {
  code: string;
  name: string;
  shortName: string;
  color: string;
  contentTypes: { code: string; label: string }[];
}

interface Selection {
  platform: string;
  contentType: string;
  accountId: string | null;
}

export function NewContentView({
  brands,
  accounts,
  media,
  platforms,
  timezone,
  demoMode
}: {
  brands: Brand[];
  accounts: Account[];
  media: Media[];
  platforms: Platform[];
  timezone: string;
  demoMode: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [brandId, setBrandId] = useState(brands.find((b) => b.id)?.id ?? '');
  const [title, setTitle] = useState('');
  const [masterCaption, setMasterCaption] = useState('');
  const [storyText, setStoryText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [style, setStyle] = useState('PROFESSIONAL');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);

  const brand = brands.find((b) => b.id === brandId);
  const accountsByPlatform = useMemo(() => {
    const m = new Map<string, Account[]>();
    for (const a of accounts) {
      if (!m.has(a.platform)) m.set(a.platform, []);
      m.get(a.platform)!.push(a);
    }
    return m;
  }, [accounts]);

  function toggleMedia(id: string) {
    setMediaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelection(platform: string, contentType: string) {
    setSelections((prev) => {
      const exists = prev.some((s) => s.platform === platform && s.contentType === contentType);
      if (exists) return prev.filter((s) => !(s.platform === platform && s.contentType === contentType));
      const first = accountsByPlatform.get(platform)?.[0];
      return [...prev, { platform, contentType, accountId: first?.id ?? null }];
    });
  }

  function setAccount(platform: string, contentType: string, accountId: string | null) {
    setSelections((prev) =>
      prev.map((s) => (s.platform === platform && s.contentType === contentType ? { ...s, accountId } : s))
    );
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('mode', 'original');
        fd.append('file', file);
        if (brandId) fd.append('brandId', brandId);
        const res = await api.upload<{ asset: Media }>('/api/media/upload', fd);
        setMediaIds((prev) => (prev.includes(res.asset.id) ? prev : [...prev, res.asset.id]));
        media.unshift(res.asset);
      }
      toast.success('Medya yüklendi');
    } catch (e) {
      toast.error('Yüklenemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function create() {
    if (!brandId) {
      toast.error('Marka seçin', 'İçerik bir marka profiline bağlı olmalıdır.');
      return;
    }
    if (!masterCaption.trim() && !title.trim()) {
      toast.error('Ana açıklama boş', 'En az bir ana açıklama yazın.');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post<{ id: string }>('/api/contents', {
        brandId,
        title: title.trim() || null,
        masterCaption: masterCaption.trim(),
        storyText: storyText.trim() || null,
        linkUrl: linkUrl.trim() || null,
        defaultStyle: style,
        defaultCta: brand?.defaultCta ?? null,
        mediaIds,
        selections,
        timezone
      });
      toast.success('İçerik oluşturuldu', 'Şimdi platformlara uyarlayabilirsiniz.');
      router.push(`/app/icerik/${res.id}`);
      router.refresh();
    } catch (e) {
      toast.error('Oluşturulamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
      setCreating(false);
    }
  }

  const selectedCount = selections.length;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Yeni İçerik</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          Bir ana medya ve bir ana açıklama yazın; platformları seçin. AI her platforma göre ayrı ayrı uyarlayacak.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* Marka + başlık */}
          <section className="card card-pad space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Marka *</label>
                <select className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                  <option value="">Marka seçin…</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Anlatım tarzı</label>
                <select className="select" value={style} onChange={(e) => setStyle(e.target.value)}>
                  {Object.entries(CONTENT_STYLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Başlık (opsiyonel)</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="İçeriği kolay bulmak için kısa bir başlık" />
              </div>
            </div>
          </section>

          {/* Ana açıklama */}
          <section className="card">
            <header className="border-b border-line px-5 py-3">
              <h2 className="section-title">Ana Açıklama</h2>
              <p className="section-sub">Tüm platformların türetileceği master metin. Fiyat, tarih, koşul ve bağlantıları buraya yazın.</p>
            </header>
            <div className="p-5">
              <textarea
                className="textarea"
                rows={8}
                value={masterCaption}
                onChange={(e) => setMasterCaption(e.target.value)}
                placeholder="Örn: Yeni sezon Etiyopya Yirgacheffe çekirdeklerimiz raflarda! Lansmana özel 250 gramlık paketlerde %15 indirim. Kampanya 20 Eylül 2026'ya kadar geçerli…"
              />
              <div className="mt-1 flex items-center justify-between">
                <p className="hint">AI bu metni asla basitçe kesmez; anlamı koruyarak her platforma yeniden yazar.</p>
                <span className="hint">{charLength(masterCaption)} karakter</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Hikaye metni (opsiyonel)</label>
                  <input className="input" value={storyText} onChange={(e) => setStoryText(e.target.value)} placeholder="Hikayeler için ayrı kısa metin" />
                </div>
                <div>
                  <label className="label">Bağlantı (opsiyonel)</label>
                  <input className="input" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://" />
                </div>
              </div>
            </div>
          </section>

          {/* Medya */}
          <section className="card">
            <header className="flex items-center justify-between border-b border-line px-5 py-3">
              <div>
                <h2 className="section-title">Master Medya</h2>
                <p className="section-sub">Orijinal dosya korunur; her platform için otomatik yeniden boyutlandırılır.</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
              <button className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Spinner size={14} /> : <Icon name="upload" size={14} />} Yükle
              </button>
            </header>
            <div className="p-4">
              {media.length === 0 ? (
                <p className="hint py-6 text-center">Kütüphanede medya yok. Yukarıdan yükleyin.</p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {media.map((m) => {
                    const active = mediaIds.includes(m.id);
                    return (
                      <li key={m.id}>
                        <button
                          onClick={() => toggleMedia(m.id)}
                          className={`relative aspect-square w-full overflow-hidden rounded-lg border-2 transition-colors ${
                            active ? 'border-brand-500' : 'border-line hover:border-brand-300'
                          }`}
                          title={`${m.originalName} · ${formatBytes(m.bytes)}`}
                        >
                          {m.publicUrl && m.kind !== 'VIDEO' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.publicUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-surface-subtle text-ink-faint">
                              <Icon name={m.kind === 'VIDEO' ? 'video' : 'image'} size={22} />
                            </span>
                          )}
                          {active && (
                            <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                              <Icon name="check" size={12} />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Platform seçimi */}
          <section className="card">
            <header className="border-b border-line px-5 py-3">
              <h2 className="section-title">Platformlar ve İçerik Türleri</h2>
              <p className="section-sub">Her seçim için ayrı bir uyarlanmış metin ve önizleme oluşturulur.</p>
            </header>
            <div className="space-y-3 p-5">
              {platforms.map((p) => (
                <div key={p.code} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <PlatformIcon platform={p.code} size={22} rounded="md" />
                    <span className="text-[13.5px] font-bold text-ink">{p.name}</span>
                    {accountsByPlatform.get(p.code)?.length ? (
                      <span className="hint">{accountsByPlatform.get(p.code)!.length} bağlı hesap</span>
                    ) : (
                      <Badge tone="warning">Bağlı hesap yok</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.contentTypes.map((ct) => {
                      const sel = selections.find((s) => s.platform === p.code && s.contentType === ct.code);
                      const active = Boolean(sel);
                      return (
                        <button
                          key={ct.code}
                          onClick={() => toggleSelection(p.code, ct.code)}
                          className={`chip ${active ? 'chip-active' : ''}`}
                          style={active ? { background: p.color, borderColor: p.color, color: '#fff' } : undefined}
                        >
                          {active && <Icon name="check" size={12} />} {ct.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sağ özet */}
        <aside className="lg:sticky lg:top-4 h-fit space-y-4">
          <div className="card card-pad">
            <h3 className="section-title mb-3">Özet</h3>
            <dl className="space-y-2 text-[12.5px]">
              <Row label="Marka" value={brand?.name ?? '—'} />
              <Row label="Ana açıklama" value={masterCaption.trim() ? `${charLength(masterCaption)} karakter` : '—'} />
              <Row label="Medya" value={mediaIds.length ? `${mediaIds.length} dosya` : '—'} />
              <Row label="Hedef" value={selectedCount ? `${selectedCount} platform/tür` : '—'} />
            </dl>

            {selectedCount > 0 && (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                {selections.map((s) => {
                  const p = platforms.find((x) => x.code === s.platform);
                  const ct = p?.contentTypes.find((c) => c.code === s.contentType);
                  const accts = accountsByPlatform.get(s.platform) ?? [];
                  return (
                    <div key={`${s.platform}:${s.contentType}`} className="flex items-center gap-2">
                      <PlatformIcon platform={s.platform} size={18} rounded="sm" muted />
                      <span className="flex-1 truncate text-[12px] text-ink-muted">
                        {p?.name} · {ct?.label}
                      </span>
                      <select
                        className="select h-7 w-[110px] py-0 text-[11px]"
                        value={s.accountId ?? ''}
                        onChange={(e) => setAccount(s.platform, s.contentType, e.target.value || null)}
                      >
                        <option value="">Hesap yok</option>
                        {accts.map((a) => (
                          <option key={a.id} value={a.id}>
                            @{a.handle}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            <button className="btn-primary btn-lg mt-4 w-full" onClick={create} disabled={creating}>
              {creating ? <Spinner size={16} /> : <Icon name="sparkles" size={16} />}
              {creating ? 'Oluşturuluyor…' : 'İçeriği Oluştur ve Uyarla'}
            </button>
            {demoMode && <p className="hint mt-2 text-center">Demo Modu — gerçek paylaşım yapılmaz.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="truncate font-semibold text-ink">{value}</dd>
    </div>
  );
}
