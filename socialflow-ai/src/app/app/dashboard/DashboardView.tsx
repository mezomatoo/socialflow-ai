'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, EmptyState, ProgressBar, StatusPill } from '@/components/ui';
import { formatCompact, formatDate, formatNumber, formatRelative, formatTime } from '@/lib/format';
import type { DashboardStats } from '@/lib/services/analyticsService';
import { CONTENT_TYPE_LABELS, PUBLISH_STATUS_LABELS } from '@/lib/platforms/platforms';

interface Props {
  stats: DashboardStats;
  brands: { id: string; name: string; primaryColor: string; logoUrl: string | null; isDefault: boolean }[];
  accounts: { id: string; platform: string; handle: string; displayName: string; connectionStatus: string; demoAccount: boolean }[];
  recentFailures: { id: string; contentId: string; platform: string; contentType: string; lastError: string | null; updatedAt: string }[];
  user: { name: string; workspaceName: string; timezone: string };
  demoMode: boolean;
}

export function DashboardView({ stats, brands, accounts, recentFailures, user, demoMode }: Props) {
  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const maxDist = Math.max(1, ...stats.platformDistribution.map((p) => p.count));

  const cards = [
    {
      label: 'Bağlı Hesaplar',
      value: stats.connectedAccounts,
      hint: stats.needsReauth > 0 ? `${stats.needsReauth} hesap yeniden bağlanmalı` : `${stats.activeAccounts} hesap aktif`,
      icon: 'users',
      href: '/app/hesaplar',
      tone: stats.needsReauth > 0 ? 'warning' : 'brand'
    },
    {
      label: 'Bugün Yayınlanacak',
      value: stats.publishingToday,
      hint: 'Bugünün içerik planı aşağıda',
      icon: 'zap',
      href: '/app/takvim',
      tone: 'brand'
    },
    {
      label: 'Planlanan Gönderiler',
      value: stats.scheduledTotal,
      hint: 'Kuyrukta bekleyen tüm hedefler',
      icon: 'clock',
      href: '/app/icerik/planlananlar',
      tone: 'info'
    },
    {
      label: 'Başarılı Yayınlar',
      value: stats.publishedTotal,
      hint: 'Toplam yayınlanan hedef',
      icon: 'check-circle',
      href: '/app/icerik/yayinlananlar',
      tone: 'success'
    },
    {
      label: 'Başarısız Yayınlar',
      value: stats.failedTotal,
      hint: stats.failedTotal > 0 ? 'Tekrar denenebilir' : 'Sorun yok',
      icon: 'alert-triangle',
      href: '/app/icerik/yayinlananlar?durum=FAILED',
      tone: stats.failedTotal > 0 ? 'danger' : 'neutral'
    },
    {
      label: 'Taslaklar',
      value: stats.drafts,
      hint: 'Üzerinde çalışılan içerikler',
      icon: 'draft',
      href: '/app/icerik/taslaklar',
      tone: 'neutral'
    },
    {
      label: 'Bu Ayki İçerikler',
      value: stats.monthContents,
      hint: new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
      icon: 'layers',
      href: '/app/takvim',
      tone: 'brand'
    },
    {
      label: 'Kısmen Yayınlanan',
      value: stats.partiallyPublished,
      hint: 'Bazı platformlarda hata var',
      icon: 'alert-triangle',
      href: '/app/icerik/yayinlananlar?durum=PARTIALLY_PUBLISHED',
      tone: stats.partiallyPublished > 0 ? 'warning' : 'neutral'
    }
  ];

  const toneColor: Record<string, string> = {
    brand: 'var(--brand-600)',
    info: 'var(--info)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    neutral: '#64748b'
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      {/* Başlık */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">
            {greeting}, {user.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            {user.workspaceName} · {formatDate(new Date(), user.timezone)} ·{' '}
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', timeZone: user.timezone })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/takvim" className="btn-secondary btn-md">
            <Icon name="calendar" size={16} />
            İçerik Takvimi
          </Link>
          <Link href="/yeni-icerik" className="btn-primary btn-md">
            <Icon name="sparkles" size={16} strokeWidth={2} />
            Yeni İçerik Oluştur
          </Link>
        </div>
      </div>

      {/* Özet kartları */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="card card-pad card-hover group block"
          >
            <div className="flex items-start justify-between">
              <span className="stat-label">{c.label}</span>
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
                style={{ background: `color-mix(in srgb, ${toneColor[c.tone]} 12%, transparent)`, color: toneColor[c.tone] }}
              >
                <Icon name={c.icon} size={15} strokeWidth={2} />
              </span>
            </div>
            <p className="stat-value mt-3">{formatNumber(c.value)}</p>
            <p className="mt-1.5 text-[11.5px] font-medium leading-snug text-ink-faint">{c.hint}</p>
          </Link>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Bugünün İçerik Planı */}
        <section className="card xl:col-span-2">
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="section-title">Bugünün İçerik Planı</h2>
              <p className="section-sub">Bugün yayınlanacak tüm hedefler, saat sırasına göre</p>
            </div>
            <Link href="/takvim" className="btn-ghost btn-sm">
              Takvim <Icon name="arrowRight" size={14} />
            </Link>
          </header>

          {stats.todayPlan.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="calendar"
                title="Bugün için planlanmış içerik yok"
                description="Yeni bir içerik oluşturup bugüne planlayabilir veya takvimden sürükleyerek taşıyabilirsiniz."
                action={
                  <Link href="/yeni-icerik" className="btn-primary btn-md">
                    <Icon name="plus" size={15} /> Yeni İçerik
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {stats.todayPlan.map((item) => (
                <li key={item.id}>
                  <Link href={`/app/icerik/${item.contentId || item.platformContentId}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-subtle">
                    <span className="w-14 shrink-0 text-center">
                      <span className="block text-[15px] font-extrabold tabular-nums text-ink">{formatTime(item.scheduledFor, user.timezone)}</span>
                    </span>
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-sunken">
                      {item.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-ink-faint">
                          <Icon name="image" size={16} />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <PlatformIcon platform={item.platform} size={17} />
                        <span className="text-[13px] font-bold text-ink">{item.platformName}</span>
                        <span className="text-[12px] text-ink-faint">· {CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-muted">{item.captionPreview || 'Açıklama henüz yazılmadı'}</span>
                      {item.account ? <span className="mt-0.5 block truncate text-[11px] text-ink-faint">{item.account}</span> : null}
                    </span>
                    <StatusPill status={item.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Sağ sütun */}
        <div className="space-y-5">
          {/* Platform bazlı dağılım */}
          <section className="card">
            <header className="border-b border-line px-5 py-4">
              <h2 className="section-title">Platform Bazlı Dağılım</h2>
              <p className="section-sub">Oluşturulan tüm hedefler</p>
            </header>
            <div className="p-5">
              {stats.platformDistribution.length === 0 ? (
                <p className="py-4 text-center text-[12.5px] text-ink-muted">Henüz içerik oluşturulmadı.</p>
              ) : (
                <ul className="space-y-3">
                  {stats.platformDistribution.slice(0, 7).map((p) => (
                    <li key={p.platform}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <PlatformIcon platform={p.platform} size={18} />
                          <span className="text-[12.5px] font-bold text-ink">{p.label}</span>
                        </span>
                        <span className="text-[12px] font-bold tabular-nums text-ink-muted">{formatNumber(p.count)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${(p.count / maxDist) * 100}%`, background: p.color }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Yaklaşan paylaşımlar */}
          <section className="card">
            <header className="border-b border-line px-5 py-4">
              <h2 className="section-title">Yaklaşan Paylaşımlar</h2>
              <p className="section-sub">Sıradaki 6 yayın</p>
            </header>
            {stats.upcoming.length === 0 ? (
              <p className="px-5 py-6 text-center text-[12.5px] text-ink-muted">Planlanmış yayın bulunmuyor.</p>
            ) : (
              <ul className="divide-y divide-line">
                {stats.upcoming.slice(0, 6).map((u) => (
                  <li key={u.id}>
                    <Link href={`/app/icerik/${u.contentId || u.platformContentId}`} className="flex items-center gap-2.5 px-5 py-2.5 transition-colors hover:bg-surface-subtle">
                      <PlatformIcon platform={u.platform} size={20} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-ink">
                          {u.platformName} · {CONTENT_TYPE_LABELS[u.contentType] ?? u.contentType}
                        </span>
                        <span className="block text-[11.5px] text-ink-faint">{formatRelative(u.scheduledFor, user.timezone)}</span>
                      </span>
                      <Icon name="chevronRight" size={14} className="shrink-0 text-ink-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Alt satır */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Hesap sağlığı */}
        <section className="card">
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="section-title">Hesap Bağlantıları</h2>
            <Link href="/sosyal-hesaplar" className="btn-ghost btn-sm">
              Yönet
            </Link>
          </header>
          <ul className="divide-y divide-line">
            {accounts.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 px-5 py-2.5">
                <PlatformIcon platform={a.platform} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold text-ink">{a.displayName}</span>
                  <span className="block truncate text-[11.5px] text-ink-faint">{a.handle}</span>
                </span>
                {a.connectionStatus === 'ACTIVE' ? (
                  <Badge tone="success">
                    <Icon name="check" size={10} strokeWidth={3} /> Bağlı
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    <Icon name="alert-triangle" size={10} strokeWidth={2.6} /> Yeniden bağlanmalı
                  </Badge>
                )}
              </li>
            ))}
            {accounts.length === 0 ? (
              <li className="px-5 py-6 text-center text-[12.5px] text-ink-muted">Henüz hesap bağlanmadı.</li>
            ) : null}
          </ul>
        </section>

        {/* Hatalar */}
        <section className="card">
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="section-title">Dikkat Gerektirenler</h2>
            {recentFailures.length > 0 ? <Badge tone="danger">{recentFailures.length}</Badge> : null}
          </header>
          {recentFailures.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)' }}>
                <Icon name="check-circle" size={20} strokeWidth={2.2} />
              </span>
              <p className="text-[13px] font-bold text-ink">Her şey yolunda</p>
              <p className="mt-1 text-[12px] text-ink-muted">Başarısız yayın bulunmuyor.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {recentFailures.map((f) => (
                <li key={f.id} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={f.platform} size={18} />
                    <span className="text-[12.5px] font-bold text-ink">{CONTENT_TYPE_LABELS[f.contentType] ?? f.contentType}</span>
                    <span className="ml-auto text-[11px] text-ink-faint">{formatRelative(f.updatedAt)}</span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-danger">{f.lastError ?? 'Bilinmeyen hata'}</p>
                  <Link href={`/app/icerik/${f.contentId}`} className="mt-1.5 inline-block text-[11.5px] font-bold text-brand-600 hover:underline">
                    Tekrar Dene →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Markalar + hızlı işlem */}
        <section className="card">
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="section-title">Marka Profilleri</h2>
            <Link href="/marka-profilleri" className="btn-ghost btn-sm">
              Tümü
            </Link>
          </header>
          <ul className="divide-y divide-line">
            {brands.map((b) => (
              <li key={b.id}>
                <Link href={`/yeni-icerik?marka=${b.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-subtle">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-black text-white" style={{ background: b.primaryColor }}>
                    {b.name.slice(0, 2).toLocaleUpperCase('tr-TR')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-ink">{b.name}</span>
                    <span className="block text-[11.5px] text-ink-faint">{b.isDefault ? 'Varsayılan marka' : 'Marka profili'}</span>
                  </span>
                  <Icon name="arrowRight" size={15} className="text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-line p-4">
            <Link href="/ai-asistan" className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 transition-colors hover:bg-brand-50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: 'var(--brand-600)' }}>
                <Icon name="sparkles" size={17} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold text-brand-800">AI İçerik Asistanı</span>
                <span className="block text-[11.5px] leading-snug text-brand-700/80">Gönderi, kampanya ve hikaye metni üret</span>
              </span>
            </Link>
          </div>
        </section>
      </div>

      {demoMode ? (
        <p className="mt-6 rounded-xl border border-warning/25 bg-warning/8 px-4 py-3 text-center text-[12px] font-medium text-[#92400e]">
          Demo Modu — gerçek sosyal medya paylaşımı yapılmadı. Tüm doğrulama, uyarlama, planlama ve yayın akışları çalışır durumdadır; yalnızca son adım simüle edilir.
        </p>
      ) : null}
    </div>
  );
}

export default DashboardView;
