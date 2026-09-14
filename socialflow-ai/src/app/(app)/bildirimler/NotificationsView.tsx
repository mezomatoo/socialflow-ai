'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, EmptyState, Segmented } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { formatRelative } from '@/lib/format';

interface NotifItem {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  readAt: string | null;
  actionLabel: string | null;
  actionRoute: string | null;
  contentId: string | null;
  createdAt: string;
}

const SEVERITY: Record<string, { icon: string; color: string; label: string }> = {
  SUCCESS: { icon: 'check-circle', color: 'var(--success)', label: 'Başarılı' },
  ERROR: { icon: 'x-circle', color: 'var(--danger)', label: 'Hata' },
  WARNING: { icon: 'alert-triangle', color: 'var(--warning)', label: 'Uyarı' },
  INFO: { icon: 'info', color: 'var(--info)', label: 'Bilgi' }
};

export function NotificationsView({ items: initial, timezone }: { items: NotifItem[]; timezone: string }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState(false);

  const unreadCount = items.filter((n) => !n.readAt).length;
  const shown = useMemo(
    () => (filter === 'unread' ? items.filter((n) => !n.readAt) : items),
    [items, filter]
  );

  async function markRead(n: NotifItem) {
    if (n.readAt) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    try {
      await api.post(`/api/notifications/${n.id}/read`);
    } catch {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: null } : x)));
    }
  }

  async function markAll() {
    setBusy(true);
    const prev = items;
    setItems((p) => p.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    try {
      await api.post('/api/notifications/read-all');
      toast.success('Tüm bildirimler okundu olarak işaretlendi');
    } catch (e) {
      setItems(prev);
      toast.error('İşlem başarısız', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Bildirimler</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Yayın sonuçları, onay istekleri ve sistem uyarıları.
            {unreadCount > 0 && <span className="ml-1 font-semibold text-brand-600">{unreadCount} okunmamış</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as 'all' | 'unread')}
            options={[
              { value: 'all', label: 'Tümü' },
              { value: 'unread', label: `Okunmamış${unreadCount ? ` (${unreadCount})` : ''}` }
            ]}
          />
          <button className="btn-secondary btn-md" onClick={markAll} disabled={busy || unreadCount === 0}>
            <Icon name="check" size={15} /> Tümünü okundu işaretle
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card p-6">
          <EmptyState
            icon="bell"
            title={filter === 'unread' ? 'Okunmamış bildirim yok' : 'Bildirim yok'}
            description={
              filter === 'unread'
                ? 'Tüm bildirimleri okudunuz. Harika!'
                : 'Yayınlama, onay ve sistem etkinlikleri burada görünecek.'
            }
          />
        </div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {shown.map((n) => {
            const sev = SEVERITY[n.severity] ?? SEVERITY.INFO;
            const unread = !n.readAt;
            const route = n.actionRoute ?? (n.contentId ? `/yeni-icerik/${n.contentId}` : null);
            return (
              <li
                key={n.id}
                className={`flex gap-3 px-4 py-3.5 transition-colors ${unread ? 'bg-brand-500/5' : ''} ${
                  route ? 'hover:bg-surface-subtle' : ''
                }`}
                onClick={() => markRead(n)}
              >
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `color-mix(in srgb, ${sev.color} 14%, transparent)`, color: sev.color }}
                >
                  <Icon name={sev.icon} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-[13.5px] ${unread ? 'font-bold text-ink' : 'font-semibold text-ink-muted'}`}>
                      {n.title}
                    </p>
                    <span className="shrink-0 whitespace-nowrap text-[11px] text-ink-faint">
                      {formatRelative(n.createdAt, timezone)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">{n.message}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {unread && (
                      <Badge tone="info">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" /> Yeni
                      </Badge>
                    )}
                    {route && (
                      <Link
                        href={route}
                        className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {n.actionLabel ?? 'Detaya git'} <Icon name="arrowRight" size={12} />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
