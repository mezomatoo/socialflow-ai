'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, EmptyState, Modal, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { formatDate, formatTime, toLocalInputValue, zonedTimeToUtc } from '@/lib/format';
import { CONTENT_TYPE_LABELS, PLATFORM_META, type PlatformCode } from '@/lib/platforms/platforms';

interface CalItem {
  id: string;
  contentId: string;
  platform: string;
  contentType: string;
  status: string;
  scheduledFor: string;
  caption: string | null;
  title: string | null;
  brand: { name: string; primaryColor: string } | null;
  account: string | null;
  thumbnail: string | null;
  mediaKind: string | null;
  lastError: string | null;
}

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Pazartesi = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function CalendarView({
  brands,
  timezone,
  demoMode
}: {
  brands: { id: string; name: string; primaryColor: string }[];
  timezone: string;
  demoMode: boolean;
}) {
  const toast = useToast();
  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState<CalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandFilter, setBrandFilter] = useState('all');
  const [editing, setEditing] = useState<CalItem | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const gridStart = useMemo(() => startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), [cursor]);
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const rangeFrom = cells[0];
  const rangeTo = addDays(cells[cells.length - 1], 1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ items: CalItem[] }>(
        `/api/calendar?from=${rangeFrom.toISOString()}&to=${rangeTo.toISOString()}`
      );
      setItems(res.items);
    } catch (e) {
      toast.error('Takvim yüklenemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of items) {
      if (brandFilter !== 'all' && it.contentId) {
        // brand filter applied via brand name match below
      }
      const d = new Date(it.scheduledFor);
      const key = isoDay(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [items, brandFilter]);

  const visibleBrands = useMemo(() => {
    if (brandFilter === 'all') return null;
    const b = brands.find((x) => x.id === brandFilter);
    return b ? b.name : null;
  }, [brandFilter, brands]);

  async function reschedule(item: CalItem, localValue: string) {
    const when = zonedTimeToUtc(localValue, timezone);
    setEditing(null);
    const prev = items;
    setItems((p) => p.map((x) => (x.id === item.id ? { ...x, scheduledFor: when.toISOString() } : x)));
    try {
      await api.patch('/api/calendar', { platformContentId: item.id, scheduledFor: when.toISOString() });
      toast.success('Yeniden planlandı', `${formatDate(when, timezone)} ${formatTime(when, timezone)}`);
      load();
    } catch (e) {
      setItems(prev);
      toast.error('Taşınamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    }
  }

  function onDropDay(day: Date) {
    if (!dragId) return;
    const item = items.find((x) => x.id === dragId);
    setDragId(null);
    if (!item) return;
    const old = new Date(item.scheduledFor);
    const next = new Date(day);
    next.setHours(old.getHours(), old.getMinutes(), 0, 0);
    reschedule(item, toLocalInputValue(next, timezone));
  }

  const today = isoDay(new Date());

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">İçerik Takvimi</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Planlanan tüm yayınlar. Bir kartı başka bir güne sürükleyerek yeniden planlayabilirsiniz.
          </p>
        </div>
        <Link href="/yeni-icerik" className="btn-primary btn-md">
          <Icon name="plus" size={16} /> Yeni İçerik
        </Link>
      </div>

      {/* Araç çubuğu */}
      <div className="card card-pad mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button className="btn-ghost btn-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} title="Önceki ay">
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="min-w-[150px] text-center text-[15px] font-bold text-ink">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </span>
          <button className="btn-ghost btn-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} title="Sonraki ay">
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
        <button className="btn-secondary btn-sm" onClick={() => setCursor(new Date())}>
          Bugün
        </button>
        <select className="select ml-auto w-auto min-w-[150px]" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
          <option value="all">Tüm markalar</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {loading && <Spinner size={16} />}
      </div>

      {/* Takvim ızgarası */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-surface-subtle">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const key = isoDay(day);
            const inMonth = day.getMonth() === cursor.getMonth();
            const dayItems = (byDay.get(key) ?? []).filter((it) => !visibleBrands || it.brand?.name === visibleBrands);
            const isToday = key === today;
            return (
              <div
                key={i}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropDay(day)}
                className={`min-h-[104px] border-b border-r border-line p-1.5 align-top transition-colors ${
                  inMonth ? 'bg-surface' : 'bg-surface-subtle/50'
                } ${i % 7 === 6 ? 'border-r-0' : ''}`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-md px-1 text-[12px] font-bold ${
                      isToday ? 'bg-brand-600 text-white' : inMonth ? 'text-ink' : 'text-ink-faint'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayItems.length > 3 && <span className="hint">{dayItems.length}</span>}
                </div>
                <div className="space-y-1">
                  {dayItems.slice(0, 3).map((it) => (
                    <div
                      key={it.id}
                      draggable
                      onDragStart={() => setDragId(it.id)}
                      onClick={() => setEditing(it)}
                      className="group flex cursor-pointer items-center gap-1 rounded-md border px-1 py-0.5 text-[10.5px] transition-colors hover:brightness-95"
                      style={{
                        borderColor: `${it.brand?.primaryColor ?? '#94a3b8'}44`,
                        background: `${it.brand?.primaryColor ?? '#94a3b8'}14`
                      }}
                      title={`${PLATFORM_META[it.platform as PlatformCode]?.name ?? it.platform} · ${formatTime(it.scheduledFor, timezone)}`}
                    >
                      <PlatformIcon platform={it.platform} size={14} rounded="sm" muted />
                      <span className="font-semibold text-ink">{formatTime(it.scheduledFor, timezone)}</span>
                      {it.status === 'FAILED' && <Icon name="alert-triangle" size={11} className="text-danger" />}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {items.length === 0 && !loading && (
        <div className="card mt-4 p-6">
          <EmptyState
            icon="calendar"
            title="Bu dönemde planlanmış içerik yok"
            description="Yeni bir içerik oluşturup takvimde bir güne planlayın."
            action={
              <Link href="/yeni-icerik" className="btn-primary btn-md">
                <Icon name="plus" size={15} /> Yeni İçerik
              </Link>
            }
          />
        </div>
      )}

      {demoMode && (
        <p className="hint mt-4 flex items-center justify-center gap-1.5 text-center">
          <Icon name="info" size={13} /> Demo Modu — gerçek sosyal medya paylaşımı yapılmadı.
        </p>
      )}

      {editing && (
        <RescheduleModal item={editing} timezone={timezone} onClose={() => setEditing(null)} onSave={reschedule} />
      )}
    </div>
  );
}

function RescheduleModal({
  item,
  timezone,
  onClose,
  onSave
}: {
  item: CalItem;
  timezone: string;
  onClose: () => void;
  onSave: (item: CalItem, localValue: string) => void;
}) {
  const [value, setValue] = useState(() => toLocalInputValue(new Date(item.scheduledFor), timezone));
  const meta = PLATFORM_META[item.platform as PlatformCode];

  return (
    <Modal
      open
      onClose={onClose}
      title="Yayını Düzenle"
      footer={
        <div className="flex justify-between gap-2">
          <Link href={`/yeni-icerik/${item.contentId}`} className="btn-secondary btn-md">
            <Icon name="edit" size={14} /> İçeriği Aç
          </Link>
          <div className="flex gap-2">
            <button className="btn-ghost btn-md" onClick={onClose}>
              Vazgeç
            </button>
            <button className="btn-primary btn-md" onClick={() => onSave(item, value)}>
              <Icon name="save" size={14} /> Yeniden Planla
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {item.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbnail} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-line bg-surface-subtle text-ink-faint">
              <PlatformIcon platform={item.platform} size={26} rounded="md" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <PlatformIcon platform={item.platform} size={18} rounded="sm" />
              <span className="text-[13.5px] font-bold text-ink">{meta?.name ?? item.platform}</span>
              <Badge tone="neutral">{CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType}</Badge>
            </div>
            <p className="mt-1 line-clamp-3 text-[12.5px] text-ink-muted">{item.caption || item.title || '—'}</p>
            {item.account && <p className="mt-1 text-[11.5px] text-ink-faint">{item.account}</p>}
          </div>
        </div>

        {item.lastError && (
          <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            <Icon name="alert-triangle" size={14} /> {item.lastError}
          </p>
        )}

        <div>
          <label className="label">Yeni tarih ve saat</label>
          <input type="datetime-local" className="input" value={value} onChange={(e) => setValue(e.target.value)} />
          <p className="hint mt-1">Zaman dilimi: {timezone}</p>
        </div>
      </div>
    </Modal>
  );
}
