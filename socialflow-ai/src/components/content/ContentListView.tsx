'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, EmptyState, StatusPill } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { formatDate, formatDateTime, formatRelative, formatTime } from '@/lib/format';
import { CONTENT_TYPE_LABELS, PLATFORM_META, type PlatformCode } from '@/lib/platforms/platforms';

export interface ContentListItem {
  id: string;
  title: string | null;
  masterCaption: string | null;
  status: string;
  statusLabel: string;
  brand: { id: string; name: string; primaryColor: string; logoUrl: string | null } | null;
  media: { id: string; publicUrl: string | null; kind: string; width: number | null; height: number | null }[];
  targets: {
    id: string;
    platform: string;
    contentType: string;
    status: string;
    scheduledFor: string | null;
    lastError: string | null;
    charUsed: number | null;
    charLimit: number | null;
  }[];
  targetCount: number;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

interface Props {
  items: ContentListItem[];
  brands: { id: string; name: string }[];
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
  timezone: string;
  demoMode: boolean;
  /** Hangi tarih alanı öne çıkarılsın (planlananlar/yayınlananlar için). */
  dateMode?: 'scheduled' | 'published' | 'updated';
}

type SortKey = 'date' | 'title' | 'targets';

export function ContentListView({
  items: initialItems,
  brands,
  title,
  subtitle,
  emptyTitle,
  emptyDescription,
  timezone,
  demoMode,
  dateMode = 'updated'
}: Props) {
  const toast = useToast();
  const [items, setItems] = useState(initialItems);
  const [q, setQ] = useState('');
  const [brandId, setBrandId] = useState('all');
  const [sort, setSort] = useState<SortKey>('date');
  const [busyId, setBusyId] = useState<string | null>(null);

  const dateOf = useCallback(
    (c: ContentListItem): string | null => {
      if (dateMode === 'scheduled') return c.scheduledFor ?? c.updatedAt;
      if (dateMode === 'published') return c.publishedAt ?? c.updatedAt;
      return c.updatedAt;
    },
    [dateMode]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    let list = items.filter((c) => {
      if (brandId !== 'all' && c.brand?.id !== brandId) return false;
      if (!needle) return true;
      const hay = `${c.title ?? ''} ${c.masterCaption ?? ''}`.toLocaleLowerCase('tr-TR');
      return hay.includes(needle);
    });
    list = [...list].sort((a, b) => {
      if (sort === 'title') return (a.title ?? '').localeCompare(b.title ?? '', 'tr-TR');
      if (sort === 'targets') return b.targetCount - a.targetCount;
      const ad = dateOf(a) ? new Date(dateOf(a)!).getTime() : 0;
      const bd = dateOf(b) ? new Date(dateOf(b)!).getTime() : 0;
      return bd - ad;
    });
    return list;
  }, [items, q, brandId, sort, dateOf]);


  async function duplicate(c: ContentListItem) {
    if (!c.brand?.id) {
      toast.error('Marka gerekli', 'Bu içerik kopyalanamıyor çünkü bir marka profili yok.');
      return;
    }
    setBusyId(c.id);
    try {
      const created = await api.post<{ id: string }>('/api/contents', {
        brandId: c.brand.id,
        title: `${c.title ?? 'İçerik'} (kopya)`,
        masterCaption: c.masterCaption ?? ''
      });
      toast.success('Kopya taslak oluşturuldu', 'Düzenlemek için açılıyor.');
      window.location.href = `/app/icerik/${created.id}`;
    } catch (e) {
      toast.error('Kopyalanamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusyId(null);
    }
  }

  /** Faz 2 §59: Planlananlar satırından hızlı "Şimdi Yayınla". */
  async function publishNow(c: ContentListItem) {
    if (!window.confirm(`"${c.title}" şimdi yayınlandıktan sonra planlama iptal edilir. Onaylıyor musunuz?`)) return;
    setBusyId(c.id);
    try {
      const res = await api.post<{ ready: number; total: number }>(`/api/contents/${c.id}/publish`, {});
      toast.success('Yayın tamamlandı', `${res.ready}/${res.total} hedef başarılı. Detaylar için içeriği açın.`);
      if (typeof window !== 'undefined') window.location.reload();
    } catch (e) {
      toast.error('Yayımlanamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
      setBusyId(null);
    }
  }

  /** Faz 2 §59: Planlamayı İptal Et — kuyruk işi iptal edilir, içerik taslağa döner. */
  async function cancelSchedule(c: ContentListItem) {
    if (!window.confirm(`"${c.title}" için planlama iptal edilsin mi? İçerik taslak olarak korunur.`)) return;
    setBusyId(c.id);
    try {
      await api.post(`/api/contents/${c.id}/schedule`, { cancel: true });
      toast.success('Planlama iptal edildi', 'İçerik taslak olarak korundu.');
      if (typeof window !== 'undefined') window.location.reload();
    } catch (e) {
      toast.error('İptal edilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
      setBusyId(null);
    }
  }

  async function remove(c: ContentListItem) {
    if (!window.confirm(`"${c.title ?? 'İçerik'}" silinsin mi? Bu işlem geri alınamaz.`)) return;
    setBusyId(c.id);
    try {
      await api.del(`/api/contents/${c.id}`);
      setItems((prev) => prev.filter((x) => x.id !== c.id));
      toast.success('İçerik silindi');
    } catch (e) {
      toast.error('Silinemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">{title}</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">{subtitle}</p>
        </div>
        <Link href="/app/icerik/yeni" className="btn-primary btn-md">
          <Icon name="plus" size={16} /> Yeni İçerik
        </Link>
      </div>

      {/* Filtre çubuğu */}
      <div className="card card-pad mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            <Icon name="search" size={16} />
          </span>
          <input
            className="input pl-9"
            placeholder="Başlık veya metinde ara…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="select w-auto min-w-[160px]" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="all">Tüm markalar</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select className="select w-auto min-w-[150px]" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="date">Tarihe göre</option>
          <option value="title">Başlığa göre</option>
          <option value="targets">Hedef sayısına göre</option>
        </select>
        <span className="hint ml-auto whitespace-nowrap">{filtered.length} içerik</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="p-6">
            <EmptyState
              icon="layers"
              title={items.length === 0 ? emptyTitle : 'Eşleşen içerik bulunamadı'}
              description={items.length === 0 ? emptyDescription : 'Arama veya filtre ölçütlerini değiştirmeyi deneyin.'}
              action={
                items.length === 0 ? (
                  <Link href="/app/icerik/yeni" className="btn-primary btn-md">
                    <Icon name="plus" size={15} /> Yeni İçerik
                  </Link>
                ) : (
                  <button
                    className="btn-secondary btn-md"
                    onClick={() => {
                      setQ('');
                      setBrandId('all');
                    }}
                  >
                    <Icon name="refresh" size={15} /> Filtreleri temizle
                  </button>
                )
              }
            />
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((c) => {
            const thumb = c.media.find((m) => m.publicUrl)?.publicUrl ?? null;
            const platforms = Array.from(new Set(c.targets.map((t) => t.platform)));
            const failed = c.targets.filter((t) => t.status === 'FAILED').length;
            const d = dateOf(c);
            return (
              <li key={c.id}>
                <div className="card card-hover flex gap-3 p-3">
                  <Link
                    href={`/app/icerik/${c.id}`}
                    className="checkerboard relative h-[86px] w-[86px] shrink-0 overflow-hidden rounded-xl border border-line bg-surface-subtle"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-ink-faint">
                        <Icon name="image" size={22} />
                      </span>
                    )}
                    {c.media.length > 1 && (
                      <span className="absolute bottom-1 right-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        +{c.media.length - 1}
                      </span>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/app/icerik/${c.id}`} className="min-w-0 flex-1">
                        <h3 className="truncate text-[14.5px] font-bold text-ink hover:text-brand-600">
                          {c.title || c.masterCaption?.slice(0, 60) || 'İsimsiz içerik'}
                        </h3>
                      </Link>
                      <StatusPill status={c.status} />
                    </div>

                    <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-muted">
                      {c.masterCaption?.slice(0, 140) || 'Açıklama yok'}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-ink-faint">
                      {c.brand && (
                        <span className="inline-flex items-center gap-1 font-medium">
                          <span className="h-2 w-2 rounded-full" style={{ background: c.brand.primaryColor }} />
                          {c.brand.name}
                        </span>
                      )}
                      {d && (
                        <span className="inline-flex items-center gap-1" title={formatDateTime(d, timezone)}>
                          <Icon name="clock" size={12} />
                          {dateMode === 'updated' ? formatRelative(d, timezone) : formatDateTime(d, timezone)}
                        </span>
                      )}
                      {failed > 0 && (
                        <Badge tone="danger">
                          <Icon name="alert-triangle" size={11} /> {failed} hata
                        </Badge>
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {platforms.length === 0 ? (
                          <span className="hint">Henüz platform seçilmedi</span>
                        ) : (
                          platforms.slice(0, 8).map((p) => (
                            <span key={p} title={PLATFORM_META[p as PlatformCode]?.name ?? p}>
                              <PlatformIcon platform={p} size={22} rounded="md" muted />
                            </span>
                          ))
                        )}
                        {platforms.length > 8 && <span className="hint">+{platforms.length - 8}</span>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {dateMode === 'scheduled' && (
                          <>
                            <button
                              className="btn-ghost btn-sm"
                              title="Şimdi Yayınla"
                              disabled={busyId === c.id}
                              onClick={() => publishNow(c)}
                            >
                              <Icon name="send" size={14} />
                            </button>
                            <button
                              className="btn-ghost btn-sm"
                              title="Planlamayı İptal Et"
                              disabled={busyId === c.id}
                              onClick={() => cancelSchedule(c)}
                            >
                              <Icon name="x" size={14} />
                            </button>
                          </>
                        )}
                        <button
                          className="btn-ghost btn-sm"
                          title="Kopyala"
                          disabled={busyId === c.id}
                          onClick={() => duplicate(c)}
                        >
                          <Icon name="copy" size={14} />
                        </button>
                        <button className="btn-ghost btn-sm" title="Sil" disabled={busyId === c.id} onClick={() => remove(c)}>
                          <Icon name="trash" size={14} />
                        </button>
                        <Link href={`/app/icerik/${c.id}`} className="btn-secondary btn-sm">
                          Aç <Icon name="arrowRight" size={13} />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {demoMode && (
        <p className="hint mt-5 flex items-center justify-center gap-1.5 text-center">
          <Icon name="info" size={13} /> Demo Modu — gerçek sosyal medya paylaşımı yapılmadı.
        </p>
      )}
    </div>
  );
}
