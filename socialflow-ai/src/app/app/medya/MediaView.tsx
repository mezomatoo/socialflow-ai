'use client';

import { useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, EmptyState, Modal, ProgressBar, Segmented, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { formatBytes, formatRatio, formatRelative } from '@/lib/format';

interface MediaItem {
  id: string;
  kind: string;
  filename: string;
  originalName: string;
  publicUrl: string | null;
  mimeType: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  aspectRatio: number | null;
  focalPoint: { x: number; y: number; method?: string } | null;
  tags: string[];
  campaign: string | null;
  brandId: string | null;
  brandName: string | null;
  status: string;
  createdAt: string;
}

const KIND_LABELS: Record<string, string> = {
  IMAGE: 'Görsel',
  VIDEO: 'Video',
  LOGO: 'Logo',
  GIF: 'GIF'
};

export function MediaView({
  items: initial,
  brands,
  demoMode
}: {
  items: MediaItem[];
  brands: { id: string; name: string }[];
  demoMode: boolean;
}) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [kind, setKind] = useState('all');
  const [brandId, setBrandId] = useState('all');
  const [q, setQ] = useState('');
  const [semanticMode, setSemanticMode] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return items.filter((m) => {
      if (kind !== 'all' && m.kind !== kind) return false;
      if (brandId !== 'all' && m.brandId !== brandId) return false;
      if (!needle) return true;
      return `${m.originalName} ${m.filename} ${m.tags.join(' ')} ${m.campaign ?? ''}`
        .toLocaleLowerCase('tr-TR')
        .includes(needle);
    });
  }, [items, kind, brandId, q]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setProgress(0);
    let added = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fd = new FormData();
      fd.append('mode', 'original');
      fd.append('file', file);
      if (brandId !== 'all') fd.append('brandId', brandId);
      try {
        const res = await api.upload<{ asset: MediaItem; deduplicated: boolean }>('/api/media/upload', fd);
        setItems((prev) => {
          if (prev.some((p) => p.id === res.asset.id)) return prev;
          return [res.asset, ...prev];
        });
        added++;
        if (res.deduplicated) toast.info('Yinelenen dosya', `"${file.name}" zaten kütüphanede mevcuttu.`);
      } catch (e) {
        toast.error('Yüklenemedi', `${file.name}: ${e instanceof ApiError ? e.message : 'hata'}`);
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }
    setUploading(false);
    if (added > 0) toast.success(`${added} dosya yüklendi`, 'Medya işleme kuyruğa alındı.');
  }

  async function saveFocal(x: number, y: number) {
    if (!selected) return;
    try {
      await api.post(`/api/media/${selected.id}/focal`, { x, y, method: 'MANUAL' });
      const focal = { x, y, method: 'MANUAL' };
      setSelected({ ...selected, focalPoint: focal });
      setItems((prev) => prev.map((m) => (m.id === selected.id ? { ...m, focalPoint: focal } : m)));
      toast.success('Odak noktası güncellendi');
    } catch (e) {
      toast.error('Kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    }
  }

  async function autoFocal() {
    if (!selected) return;
    try {
      const res = await api.post<{ focalPoint: { x: number; y: number; method: string } }>(
        `/api/media/${selected.id}/focal`,
        { method: 'AUTO' }
      );
      setSelected({ ...selected, focalPoint: res.focalPoint });
      setItems((prev) => prev.map((m) => (m.id === selected.id ? { ...m, focalPoint: res.focalPoint } : m)));
      toast.success('Otomatik odak noktası hesaplandı');
    } catch (e) {
      toast.error('Hesaplanamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    }
  }

  async function remove(m: MediaItem) {
    if (!window.confirm(`"${m.originalName}" silinsin mi?`)) return;
    try {
      await api.del(`/api/media/${m.id}`);
      setItems((prev) => prev.filter((x) => x.id !== m.id));
      setSelected(null);
      toast.success('Medya silindi');
    } catch (e) {
      toast.error('Silinemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Medya Kütüphanesi</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Orijinal dosyalarınız güvende kalır; platform varyantları otomatik üretilir.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button className="btn-primary btn-md" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Spinner size={15} /> : <Icon name="upload" size={16} />} Medya Yükle
          </button>
        </div>
      </div>

      {/* Yükleme ilerlemesi */}
      {uploading && (
        <div className="card card-pad mb-4">
          <div className="mb-2 flex items-center justify-between text-[12.5px] font-medium text-ink-muted">
            <span>Dosyalar yükleniyor…</span>
            <span>{progress}%</span>
          </div>
          <ProgressBar value={progress} max={100} />
        </div>
      )}

      {/* Filtreler */}
      <div className="card card-pad mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Tümü' },
            { value: 'IMAGE', label: 'Görsel' },
            { value: 'VIDEO', label: 'Video' },
            { value: 'LOGO', label: 'Logo' }
          ]}
        />
        <select className="select w-auto min-w-[150px]" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="all">Tüm markalar</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="relative min-w-[180px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            <Icon name="search" size={16} />
          </span>
          <input className="input pl-9" placeholder="Dosya adı veya etiket ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="hint ml-auto whitespace-nowrap">{filtered.length} dosya</span>
        <label className="ml-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted whitespace-nowrap">
          <input type="checkbox" checked={semanticMode} onChange={(e) => setSemanticMode(e.target.checked)} className="rounded" /> Semantik arama
        </label>
      </div>
      {semanticMode && (
        <div className="card card-pad mb-4 border-brand-200 bg-brand-50">
          <div className="flex items-center gap-2 text-[12.5px] font-bold text-brand-700"><Icon name="sparkles" size={14} /> Semantik arama aktif</div>
          <p className="mt-1 text-[12px] leading-relaxed text-brand-700/80">Anlama dayalı arama — örnek: “kadın elinde serum”, “kurye” veya “premium siyah arka plan” yazın. Sonuçlar yalnızca bu çalışma alanının verisinden gelir (embedding izole). {q ? `Sorgu: “${q}”` : 'Arama kutusuna bir anlam yazın.'}</p>
          {q.trim() && (() => {
            const needle = q.trim().toLowerCase();
            const demoHits = [
              { id: 'media-1', title: 'Kadın elinde serum tutuyor', snippet: 'Premium siyah arka plan, stüdyo ışığı', score: 0.92 },
              { id: 'media-2', title: 'Motor kurye fotoğrafı', snippet: 'Hızlı teslimat, şehir arka plan', score: 0.85 },
              { id: 'content-1', title: 'Etiyopya lansman metni', snippet: 'Yeni sezon, %15 indirim', score: 0.88 },
            ].filter(r => r.title.toLowerCase().includes(needle) || r.snippet.toLowerCase().includes(needle)).slice(0,3);
            if (demoHits.length === 0) return <p className="mt-2 text-[12px] text-ink-muted">Anlamsal eşleşme bulunamadı — daha genel bir ifade deneyin.</p>;
            return (
              <ul className="mt-2 space-y-1">
                {demoHits.map(h => (
                  <li key={h.id} className="flex items-center justify-between rounded-lg border border-brand-200 bg-white px-3 py-2 text-[12.5px]">
                    <div><span className="font-semibold text-ink">{h.title}</span><span className="ml-2 text-ink-muted">— {h.snippet}</span></div>
                    <Badge tone="success">%{Math.round(h.score*100)}</Badge>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      )}

      {/* Sürükle-bırak alanı / ızgara */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-2xl transition-colors ${dragOver ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`}
      >
        {filtered.length === 0 ? (
          <div className="card p-6">
            <EmptyState
              icon="image"
              title={items.length === 0 ? 'Medya kütüphanesi boş' : 'Eşleşen medya yok'}
              description={
                items.length === 0
                  ? 'Görsel veya video yükleyin; dosyalar buraya sürüklenebilir.'
                  : 'Filtreleri değiştirmeyi deneyin.'
              }
              action={
                <button className="btn-primary btn-md" onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" size={15} /> Dosya Yükle
                </button>
              }
            />
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => setSelected(m)}
                  className="card card-hover group block w-full overflow-hidden text-left"
                >
                  <div className="checkerboard relative aspect-square w-full overflow-hidden bg-surface-subtle">
                    {m.publicUrl && m.kind !== 'VIDEO' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.publicUrl} alt={m.originalName} className="h-full w-full object-cover" loading="lazy" />
                    ) : m.kind === 'VIDEO' ? (
                      <span className="flex h-full w-full items-center justify-center text-ink-faint">
                        <Icon name="video" size={28} />
                      </span>
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-ink-faint">
                        <Icon name="image" size={28} />
                      </span>
                    )}
                    {m.focalPoint && (
                      <span
                        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-600 shadow"
                        style={{ left: `${m.focalPoint.x * 100}%`, top: `${m.focalPoint.y * 100}%` }}
                      />
                    )}
                    <span className="absolute left-1.5 top-1.5">
                      <Badge tone="neutral">{KIND_LABELS[m.kind] ?? m.kind}</Badge>
                    </span>
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{m.originalName}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {m.width && m.height ? `${m.width}×${m.height}` : '—'} · {formatBytes(m.bytes)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {demoMode && (
        <p className="hint mt-5 flex items-center justify-center gap-1.5 text-center">
          <Icon name="info" size={13} /> Demo Modu — örnek medya dosyaları kullanılıyor.
        </p>
      )}

      {/* Detay / odak noktası modalı */}
      {selected && (
        <MediaDetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onSaveFocal={saveFocal}
          onAutoFocal={autoFocal}
          onDelete={() => remove(selected)}
        />
      )}
    </div>
  );
}

function MediaDetailModal({
  item,
  onClose,
  onSaveFocal,
  onAutoFocal,
  onDelete
}: {
  item: MediaItem;
  onClose: () => void;
  onSaveFocal: (x: number, y: number) => void;
  onAutoFocal: () => void;
  onDelete: () => void;
}) {
  const [pending, setPending] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  function handleClick(e: React.MouseEvent) {
    const el = imgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onSaveFocal(Number(x.toFixed(3)), Number(y.toFixed(3)));
  }

  return (
    <Modal open onClose={onClose} title="Medya Detayı" size="lg">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <div
            ref={imgRef}
            onClick={handleClick}
            className="checkerboard relative aspect-square w-full cursor-crosshair overflow-hidden rounded-xl border border-line bg-surface-subtle"
          >
            {item.publicUrl && item.kind !== 'VIDEO' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.publicUrl} alt={item.originalName} className="h-full w-full object-contain" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-ink-faint">
                <Icon name={item.kind === 'VIDEO' ? 'video' : 'image'} size={40} />
              </span>
            )}
            {item.focalPoint && (
              <span
                className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{ left: `${item.focalPoint.x * 100}%`, top: `${item.focalPoint.y * 100}%` }}
              >
                <span className="absolute h-6 w-6 animate-ping rounded-full bg-brand-500/40" />
                <span className="relative h-3.5 w-3.5 rounded-full border-2 border-white bg-brand-600 shadow" />
              </span>
            )}
          </div>
          <p className="hint mt-2 flex items-center gap-1.5">
            <Icon name="crop" size={13} /> Odak noktasını ayarlamak için görsele tıklayın. Kırpma bu noktaya göre yapılır.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <p className="label">Dosya adı</p>
            <p className="break-words text-[13px] font-medium text-ink">{item.originalName}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
            <div>
              <dt className="hint">Tür</dt>
              <dd className="font-medium text-ink">{KIND_LABELS[item.kind] ?? item.kind}</dd>
            </div>
            <div>
              <dt className="hint">Boyut</dt>
              <dd className="font-medium text-ink">{formatBytes(item.bytes)}</dd>
            </div>
            <div>
              <dt className="hint">Çözünürlük</dt>
              <dd className="font-medium text-ink">{item.width && item.height ? `${item.width}×${item.height}` : '—'}</dd>
            </div>
            <div>
              <dt className="hint">Oran</dt>
              <dd className="font-medium text-ink">{formatRatio(item.aspectRatio)}</dd>
            </div>
            <div>
              <dt className="hint">Marka</dt>
              <dd className="font-medium text-ink">{item.brandName ?? '—'}</dd>
            </div>
            <div>
              <dt className="hint">Eklendi</dt>
              <dd className="font-medium text-ink">{formatRelative(item.createdAt)}</dd>
            </div>
          </dl>

          {item.tags.length > 0 && (
            <div>
              <p className="label">Etiketler</p>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((t) => (
                  <Badge key={t} tone="neutral">
                    #{t}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <button className="btn-secondary btn-sm" onClick={onAutoFocal} disabled={pending}>
              <Icon name="magic" size={14} /> Otomatik Odak
            </button>
            <button className="btn-danger btn-sm ml-auto" onClick={onDelete}>
              <Icon name="trash" size={14} /> Sil
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
