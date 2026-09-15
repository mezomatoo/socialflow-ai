'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Badge, Spinner } from '@/components/ui';
import { NAV_GROUPS } from '@/lib/ui/nav';
import { api } from '@/lib/client/api';
import { clsx } from 'clsx';

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: string;
  workspaceName: string;
}

export interface ShellBranding {
  appName: string;
  logoMark: string;
  logoUrl: string | null;
  primaryColor: string;
  demoMode: boolean;
  demoBanner: boolean;
  aiProvider: string;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Sahip',
  ADMIN: 'Yönetici',
  EDITOR: 'Editör',
  CREATOR: 'İçerik Üreticisi',
  APPROVER: 'Onaylayıcı',
  VIEWER: 'Görüntüleyici'
};

export function AppShell({
  user,
  branding,
  inboxEnabled = true,
  advertisingEnabled = false,
  children
}: {
  inboxEnabled?: boolean;
  advertisingEnabled?: boolean;
  user: ShellUser;
  branding: ShellBranding;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [counts, setCounts] = useState({ drafts: 0, scheduled: 0, unread: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loadingNotif, setLoadingNotif] = useState(false);

  const refreshCounts = useCallback(async () => {
    try {
      const data = await api.get<{ drafts: number; scheduled: number; unread: number }>('/api/bootstrap');
      setCounts(data);
    } catch {
      /* sessizce yoksay */
    }
  }, []);

  useEffect(() => {
    refreshCounts();
    const t = setInterval(refreshCounts, 45_000);
    return () => clearInterval(t);
  }, [refreshCounts, pathname]);

  useEffect(() => {
    setSidebarOpen(false);
    setNotifOpen(false);
    setUserOpen(false);
  }, [pathname]);

  // Kısayollar: Ctrl/Cmd+K arama, Ctrl/Cmd+B menü
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openNotifications = async () => {
    setNotifOpen((v) => !v);
    if (!notifOpen) {
      setLoadingNotif(true);
      try {
        const data = await api.get<{ items: any[] }>('/api/notifications?limit=8');
        setNotifications(data.items ?? []);
      } catch {
        setNotifications([]);
      } finally {
        setLoadingNotif(false);
      }
    }
  };

  const badgeFor = (key?: string) => {
    if (key === 'drafts') return counts.drafts;
    if (key === 'scheduled') return counts.scheduled;
    if (key === 'notifications') return counts.unread;
    return 0;
  };

  return (
    <div className="flex min-h-screen bg-surface-subtle">
      {/* Mobil karartma */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] lg:hidden" onClick={() => setSidebarOpen(false)} />
      ) : null}

      {/* ------------------------------------------------------- Sol menü */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex w-[264px] shrink-0 flex-col border-r border-line bg-surface transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-line px-4">
          <Link href="/anasayfa" className="flex min-w-0 items-center gap-2.5">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.appName} className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-black text-white"
                style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, color-mix(in srgb, ${branding.primaryColor} 55%, #0ea5e9))` }}
              >
                {branding.logoMark.slice(0, 2)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-extrabold tracking-tight text-ink">{branding.appName}</span>
              <span className="block truncate text-[11px] font-medium text-ink-faint">{user.workspaceName}</span>
            </span>
          </Link>
          <button type="button" className="btn-icon ml-auto h-8 w-8 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Menüyü kapat">
            <Icon name="x" size={16} />
          </button>
        </div>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.filter(group => (inboxEnabled || group.id !== 'community') && (advertisingEnabled || group.id !== 'advertising')).map((group) => (
            <div key={group.id} className="mb-5 last:mb-0">
              <p className="mb-1.5 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-faint">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const count = badgeFor(item.badge);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={clsx(
                          'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-semibold transition-all',
                          active ? 'text-ink' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink'
                        )}
                        style={active ? { background: `color-mix(in srgb, ${branding.primaryColor} 10%, transparent)` } : undefined}
                        aria-current={active ? 'page' : undefined}
                      >
                        {active ? (
                          <span
                            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                            style={{ background: branding.primaryColor }}
                          />
                        ) : null}
                        <Icon name={item.icon} size={17} className={active ? '' : 'text-ink-faint group-hover:text-ink-muted'} strokeWidth={active ? 2 : 1.7} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {count > 0 ? (
                          <span
                            className={clsx(
                              'rounded-full px-1.5 py-0.5 text-[10.5px] font-bold',
                              item.badge === 'notifications' ? 'bg-danger/12 text-danger' : 'bg-surface-sunken text-ink-muted'
                            )}
                          >
                            {count > 99 ? '99+' : count}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <Link
            href="/yeni-icerik"
            className="btn-primary btn-md w-full"
            style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, color-mix(in srgb, ${branding.primaryColor} 60%, #0ea5e9))` }}
          >
            <Icon name="sparkles" size={16} strokeWidth={2} />
            Yeni İçerik Oluştur
          </Link>
          {branding.demoMode && branding.demoBanner ? (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning/8 px-2.5 py-2">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#92400e]">
                <Icon name="alert-triangle" size={12} strokeWidth={2.2} />
                Demo Modu aktif
              </p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-[#a16207]">Gerçek sosyal medya paylaşımı yapılmaz.</p>
            </div>
          ) : null}
        </div>
      </aside>

      {/* ------------------------------------------------------- İçerik */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-5">
          <button type="button" className="btn-icon h-9 w-9 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menüyü aç">
            <Icon name="menu" size={18} />
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="group hidden h-9 flex-1 max-w-md items-center gap-2 rounded-lg border border-line bg-surface-subtle px-3 text-left text-[13px] text-ink-faint transition-colors hover:border-brand-300 hover:bg-surface sm:flex"
          >
            <Icon name="search" size={15} />
            <span className="flex-1">İçerik, kampanya, etiket veya marka ara...</span>
            <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[10.5px] font-bold text-ink-faint">⌘K</kbd>
          </button>
          <button type="button" onClick={() => setSearchOpen(true)} className="btn-icon h-9 w-9 sm:hidden" aria-label="Ara">
            <Icon name="search" size={17} />
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {branding.demoMode ? (
              <Badge tone="warning" className="hidden sm:inline-flex">
                <Icon name="alert-triangle" size={11} strokeWidth={2.4} />
                Demo Modu
              </Badge>
            ) : null}

            <div className="relative">
              <button type="button" className="btn-icon relative h-9 w-9" onClick={openNotifications} aria-label="Bildirimler">
                <Icon name="bell" size={17} />
                {counts.unread > 0 ? (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-bold text-white">
                    {counts.unread > 9 ? '9+' : counts.unread}
                  </span>
                ) : null}
              </button>
              {notifOpen ? (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 top-11 z-50 w-[330px] overflow-hidden rounded-xl border border-line bg-surface shadow-pop animate-fade-in">
                    <div className="flex items-center justify-between border-b border-line px-4 py-3">
                      <p className="text-[13.5px] font-bold text-ink">Bildirimler</p>
                      <button
                        type="button"
                        className="text-[12px] font-semibold text-brand-600 hover:underline"
                        onClick={async () => {
                          await api.post('/api/notifications/read-all').catch(() => undefined);
                          setCounts((c) => ({ ...c, unread: 0 }));
                          setNotifications((n) => n.map((x) => ({ ...x, readAt: new Date().toISOString() })));
                        }}
                      >
                        Tümünü okundu işaretle
                      </button>
                    </div>
                    <div className="max-h-[340px] overflow-y-auto">
                      {loadingNotif ? (
                        <div className="flex justify-center py-8 text-ink-faint">
                          <Spinner size={18} />
                        </div>
                      ) : notifications.length === 0 ? (
                        <p className="px-4 py-8 text-center text-[12.5px] text-ink-muted">Şimdilik yeni bildirim yok.</p>
                      ) : (
                        notifications.map((n) => (
                          <Link
                            key={n.id}
                            href={n.actionRoute ?? '/bildirimler'}
                            className={clsx('flex gap-2.5 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-surface-subtle', !n.readAt && 'bg-brand-50/40')}
                            onClick={async () => {
                              await api.post(`/api/notifications/${n.id}/read`).catch(() => undefined);
                              refreshCounts();
                            }}
                          >
                            <span
                              className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                              style={{
                                background:
                                  n.severity === 'SUCCESS' ? 'var(--success)' : n.severity === 'ERROR' ? 'var(--danger)' : n.severity === 'WARNING' ? 'var(--warning)' : 'var(--info)'
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[12.5px] font-bold leading-snug text-ink">{n.title}</span>
                              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">{n.message}</span>
                            </span>
                          </Link>
                        ))
                      )}
                    </div>
                    <Link href="/bildirimler" className="block border-t border-line bg-surface-subtle px-4 py-2.5 text-center text-[12.5px] font-bold text-brand-600 hover:underline">
                      Tüm bildirimleri gör
                    </Link>
                  </div>
                </>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2 pr-2.5 transition-colors hover:bg-surface-subtle"
                onClick={() => setUserOpen((v) => !v)}
                aria-label="Hesap menüsü"
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10.5px] font-bold text-white"
                  style={{ background: branding.primaryColor }}
                >
                  {user.name.slice(0, 1).toLocaleUpperCase('tr-TR')}
                </span>
                <span className="hidden text-[12.5px] font-bold text-ink sm:block">{user.name.split(' ')[0]}</span>
                <Icon name="chevronDown" size={13} className="text-ink-faint" />
              </button>
              {userOpen ? (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} />
                  <div className="absolute right-0 top-11 z-50 w-[240px] overflow-hidden rounded-xl border border-line bg-surface shadow-pop animate-fade-in">
                    <div className="border-b border-line px-4 py-3">
                      <p className="truncate text-[13px] font-bold text-ink">{user.name}</p>
                      <p className="truncate text-[11.5px] text-ink-muted">{user.email}</p>
                      <Badge tone="brand" className="mt-1.5">
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </div>
                    <Link href="/ayarlar" className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold text-ink-muted hover:bg-surface-subtle hover:text-ink">
                      <Icon name="settings" size={15} /> Ayarlar
                    </Link>
                    <Link href="/ayarlar/entegrasyonlar" className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold text-ink-muted hover:bg-surface-subtle hover:text-ink">
                      <Icon name="key" size={15} /> Entegrasyon Durumu
                    </Link>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 text-[13px] font-semibold text-danger hover:bg-danger/5"
                      onClick={async () => {
                        await api.post('/api/auth/logout').catch(() => undefined);
                        router.push('/giris');
                        router.refresh();
                      }}
                    >
                      <Icon name="logout" size={15} /> Çıkış Yap
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        {branding.demoMode && branding.demoBanner ? (
          <div className="border-b border-warning/25 bg-warning/8 px-4 py-2 text-center">
            <p className="text-[11.5px] font-semibold text-[#92400e]">
              <strong>Demo Modu</strong> — gerçek sosyal medya paylaşımı yapılmaz. Yayın simülasyonu, doğrulama ve planlama akışları tam çalışır durumdadır.
            </p>
          </div>
        ) : null}

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {searchOpen ? <GlobalSearch onClose={() => setSearchOpen(false)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------- Genel arama */
function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await api.get(`/api/search?q=${encodeURIComponent(term)}`);
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults({ contents: [], brands: [], media: [], campaigns: [], hashtags: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const groups = useMemo(() => {
    if (!results) return [];
    return [
      { label: 'İçerikler', icon: 'draft', items: (results.contents ?? []).map((c: any) => ({ href: `/yeni-icerik/${c.id}`, title: c.title ?? (c.masterCaption.slice(0, 60) || 'Başlıksız içerik'), sub: c.statusLabel })) },
      { label: 'Markalar', icon: 'brand', items: (results.brands ?? []).map((b: any) => ({ href: `/marka-profilleri?brand=${b.id}`, title: b.name, sub: b.website ?? '' })) },
      { label: 'Kampanyalar', icon: 'zap', items: (results.campaigns ?? []).map((c: any) => ({ href: `/takvim?campaign=${c.id}`, title: c.name, sub: c.code })) },
      { label: 'Medya', icon: 'image', items: (results.media ?? []).map((m: any) => ({ href: `/medya?asset=${m.id}`, title: m.originalName, sub: `${m.kind} · ${m.format}` })) }
    ].filter((g) => g.items.length);
  }, [results]);

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-slide-up">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Icon name="search" size={17} className="text-ink-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="İçerik, kampanya, açıklama, etiket, marka veya platform ara..."
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
          />
          {loading ? <Spinner size={15} className="text-ink-faint" /> : null}
          <kbd className="rounded border border-line bg-surface-subtle px-1.5 py-0.5 text-[10.5px] font-bold text-ink-faint">ESC</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {q.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-ink-muted">Aramak için en az 2 karakter yazın.</p>
          ) : groups.length === 0 && !loading ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-ink-muted">Sonuç bulunamadı.</p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-1.5 last:mb-0">
                <p className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">{g.label}</p>
                {g.items.map((item: any, i: number) => (
                  <button
                    key={`${g.label}-${i}`}
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-subtle"
                    onClick={() => {
                      onClose();
                      router.push(item.href);
                    }}
                  >
                    <Icon name={g.icon} size={15} className="text-ink-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{item.title}</span>
                      {item.sub ? <span className="block truncate text-[11.5px] text-ink-muted">{item.sub}</span> : null}
                    </span>
                    <Icon name="arrowRight" size={14} className="text-ink-faint" />
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AppShell;
