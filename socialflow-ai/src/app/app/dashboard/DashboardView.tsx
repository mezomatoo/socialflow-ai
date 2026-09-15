'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, EmptyState, StatusPill } from '@/components/ui';
import { formatDate, formatNumber, formatRelative, formatTime } from '@/lib/format';
import type { DashboardStats } from '@/lib/services/analyticsService';
import type { Phase1Stats } from '@/lib/services/dashboardService';
import type { AssistantItem } from '@/lib/ai/dailyAssistant';
import { CONTENT_TYPE_LABELS } from '@/lib/platforms/platforms';

interface Props {
  /** Faz 1 metrikleri — ana sayfanın omurgası. */
  stats: Phase1Stats;
  /** Yayın modülü açıkken hesaplanan ek metrikler (aksi halde null). */
  publishingStats: DashboardStats | null;
  onboarding: { done: boolean; label: string; href: string; hint: string }[];
  brands: { id: string; name: string; primaryColor: string; logoUrl: string | null; isDefault: boolean }[];
  accounts: { id: string; platform: string; handle: string; displayName: string; connectionStatus: string; demoAccount: boolean }[];
  recentFailures: { id: string; contentId: string; platform: string; contentType: string; lastError: string | null; updatedAt: string }[];
  user: { name: string; workspaceName: string; timezone: string };
  demoMode: boolean;
  /** Faz 4 — AI Günlük Asistan: öncelikli görevler ve akıllı uyarılar. */
  assistant?: { greeting: string; items: AssistantItem[]; actionCenter: AssistantItem[] } | null;
}

const AI_TYPE_LABELS: Record<string, string> = {
  ADAPT_CAPTION: 'Platform uyarlaması',
  GENERATE_CAPTION: 'Açıklama üretimi',
  HASHTAGS: 'Hashtag önerisi',
  SPELLCHECK: 'Yazım denetimi',
  PUBLISHING_TIME: 'Zaman önerisi',
  STORY_TEXT: 'Hikaye metni'
};

const PROVIDER_LABELS: Record<string, string> = {
  deterministic: 'Yerel motor',
  openai: 'OpenAI',
  anthropic: 'Anthropic'
};

/**
 * Ana Sayfa görünümü (§24)
 * ---------------------------------------------------------------------------
 * Faz 1: üretim akışı ön planda (taslak → uyarlama → hazır). Yayınlama modülü
 * kapalıyken yayın metrikleri GÖSTERİLMEZ; bunun yerine modülün hangi fazda
 * geleceği dürüstçe yazılır.
 */
export function DashboardView({ stats, publishingStats, onboarding, brands, accounts, recentFailures, user, demoMode, assistant }: Props) {
  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const maxDist = Math.max(1, ...stats.platformDistribution.map((p) => p.count));
  const prompt = onboarding.find((s) => !s.done);
  const adaptedRatio = stats.totalTargets === 0 ? 0 : Math.round((stats.adaptedTargets / stats.totalTargets) * 100);

  const cards = [
    {
      label: 'Taslaklar',
      value: stats.drafts,
      hint: 'Üzerinde çalışılan içerikler',
      icon: 'draft',
      href: '/app/icerik/taslaklar',
      tone: '#64748b'
    },
    {
      label: 'Hazır İçerikler',
      value: stats.ready,
      hint: 'Tüm platform metinleri tamam',
      icon: 'check-circle',
      href: '/app/icerik/taslaklar?durum=READY',
      tone: 'var(--success)'
    },
    {
      label: 'Uyarlanmış Hedefler',
      value: stats.adaptedTargets,
      hint: `${stats.totalTargets} hedefin ${adaptedRatio}%’i`,
      icon: 'sparkles',
      href: '/app/icerik/taslaklar',
      tone: 'var(--brand-600)'
    },
    {
      label: 'Medya Varlıkları',
      value: stats.mediaAssets,
      hint: `${stats.mediaVariants} platform varyantı`,
      icon: 'image',
      href: '/app/medya',
      tone: 'var(--info)'
    },
    {
      label: 'Markalar',
      value: stats.brands,
      hint: 'Marka sesi ve yasaklı kelimeler tanımlı',
      icon: 'brand',
      href: '/app/markalar',
      tone: 'var(--warning)'
    },
    {
      label: 'Arşivlenen',
      value: stats.archived,
      hint: 'Arşivlenen içerikler silinmez',
      icon: 'archive',
      href: '/app/icerik/taslaklar?durum=ARCHIVED',
      tone: '#64748b'
    }
  ];

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
          <Link href="/app/medya" className="btn-secondary btn-md">
            <Icon name="image" size={16} /> Medya Kütüphanesi
          </Link>
          <Link href="/app/icerik/yeni" className="btn-primary btn-md">
            <Icon name="sparkles" size={16} strokeWidth={2} />
            Yeni İçerik Oluştur
          </Link>
        </div>
      </div>

      {/* Faz durumu */}
      {!stats.publishingEnabled && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-[12.5px] text-ink">
          <Icon name="info" size={16} className="text-info shrink-0" />
          <span>
            <strong>Yayınlama bu kurulumda kapalı.</strong> Şu anda
            içeriklerinizi hazırlayabilir, platforma özel metin ve görsellerini üretebilir, taslak olarak saklayabilirsiniz.
          </span>
        </div>
      )}
      {demoMode && stats.publishingEnabled && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[12.5px] text-ink">
          <Icon name="alert-triangle" size={16} className="text-warning" />
          <span><strong>Demo Modu —</strong> gerçek sosyal medya paylaşımı yapılmaz; yayınlar simülasyon olarak işaretlenir.</span>
        </div>
      )}

      {/* Sıradaki adım */}
      {prompt && (
        <section className="mb-5 card p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold uppercase tracking-wide text-brand-600">Başlangıç adımları</p>
              <h2 className="mt-1 text-[15.5px] font-bold text-ink">Sıradaki adım: {prompt.label}</h2>
              <p className="mt-1 text-[12.5px] text-ink-muted">{prompt.hint}</p>
            </div>
            <Link href={prompt.href} className="btn-primary btn-md shrink-0">
              Devam et <Icon name="arrowRight" size={15} />
            </Link>
          </div>
          <ul className="mt-4 flex flex-wrap gap-3">
            {onboarding.map((step) => (
              <li key={step.label} className="flex items-center gap-2 text-[12.5px]">
                <Icon
                  name={step.done ? 'check-circle' : 'circle'}
                  size={15}
                  className={step.done ? 'text-success' : 'text-ink-faint'}
                />
                <span className={step.done ? 'text-ink-muted line-through' : 'font-semibold text-ink'}>{step.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Faz 1 özet kartları */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card card-pad card-hover group block">
            <div className="flex items-start justify-between">
              <span className="stat-label">{c.label}</span>
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
                style={{ background: `color-mix(in srgb, ${c.tone} 12%, transparent)`, color: c.tone }}
              >
                <Icon name={c.icon} size={15} strokeWidth={2} />
              </span>
            </div>
            <p className="stat-value mt-3">{formatNumber(c.value)}</p>
            <p className="mt-1.5 text-[11.5px] font-medium leading-snug text-ink-faint">{c.hint}</p>
          </Link>
        ))}
      </div>

      {/* AI Günlük Asistan (Faz 4 entegrasyonu) */}
      {assistant && assistant.items.length > 0 && (
        <section className="card mt-5">
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="section-title flex items-center gap-2">
                <Icon name="sparkles" size={16} className="text-brand-600" /> AI Günlük Asistan
              </h2>
              <p className="section-sub">{assistant.greeting}</p>
            </div>
            <Link href="/app/ai-asistan" className="btn-ghost btn-sm">
              Asistana git <Icon name="arrowRight" size={14} />
            </Link>
          </header>
          <ul className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
            {assistant.actionCenter.slice(0, 6).map((item) => (
              <li key={item.id} className="flex items-start gap-2.5 rounded-xl border border-line p-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
                  <Icon
                    name={item.type === 'approval' ? 'check-circle' : item.type === 'warning' ? 'alert-triangle' : item.type === 'account' ? 'users' : 'calendar'}
                    size={14}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-[13px] text-ink">{item.title}</strong>
                  <span className="block text-[12px] text-ink-muted">{item.detail}</span>
                  {item.actionRoute && item.actionLabel && (
                    <Link href={item.actionRoute} className="mt-1 inline-block text-[12px] font-bold text-brand-600 hover:underline">
                      {item.actionLabel} →
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Son içerikler */}
        <section className="card xl:col-span-2">
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="section-title">Son Çalışılan İçerikler</h2>
              <p className="section-sub">Otomatik kaydedilen taslaklar ve uyarlama durumları</p>
            </div>
            <Link href="/app/icerik/taslaklar" className="btn-ghost btn-sm">
              Tümü <Icon name="arrowRight" size={14} />
            </Link>
          </header>

          {stats.recentDrafts.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="draft"
                title="Henüz içerik oluşturulmadı"
                description="Tek bir ana açıklama yazın, platformları seçin ve “Platformlara Uyarla” ile her platforma özel metni üretin."
                action={
                  <Link href="/app/icerik/yeni" className="btn-primary btn-md">
                    <Icon name="plus" size={15} /> Yeni İçerik
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {stats.recentDrafts.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/icerik/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-subtle">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold text-ink">{c.title}</span>
                      <span className="mt-0.5 block text-[11.5px] text-ink-faint">
                        {c.brandName ? `${c.brandName} · ` : ''}
                        {c.adaptedCount}/{c.platformCount} hedef uyarlanmış · {formatRelative(c.updatedAt)}
                      </span>
                    </span>
                    <StatusPill status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          {/* Platform dağılımı */}
          <section className="card">
            <header className="border-b border-line px-5 py-4">
              <h2 className="section-title">Platform Bazlı Dağılım</h2>
              <p className="section-sub">Oluşturulan tüm hedefler</p>
            </header>
            <div className="p-5">
              {stats.platformDistribution.length === 0 ? (
                <p className="py-4 text-center text-[12.5px] text-ink-muted">Henüz hedef seçilmedi.</p>
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

          {/* AI üretimleri (§39 — şeffaflık) */}
          <section className="card">
            <header className="border-b border-line px-5 py-4">
              <h2 className="section-title">Son AI Üretimleri</h2>
              <p className="section-sub">
                Sağlayıcı: {PROVIDER_LABELS[stats.aiProvider] ?? stats.aiProvider}
              </p>
            </header>
            {stats.lastGenerations.length === 0 ? (
              <p className="px-5 py-6 text-center text-[12.5px] text-ink-muted">Henüz AI üretimi yapılmadı.</p>
            ) : (
              <ul className="divide-y divide-line">
                {stats.lastGenerations.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 px-5 py-2.5">
                    {g.platform ? <PlatformIcon platform={g.platform} size={18} /> : <Icon name="sparkles" size={16} className="text-ink-faint" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-ink">
                        {AI_TYPE_LABELS[g.type] ?? g.type}
                      </span>
                      <span className="block text-[11px] text-ink-faint">
                        {PROVIDER_LABELS[g.provider] ?? g.provider} · {formatRelative(g.createdAt)}
                        {g.durationMs ? ` · ${g.durationMs} ms` : ''}
                      </span>
                    </span>
                    <Badge tone={g.status === 'SUCCESS' ? 'success' : g.status === 'FAILED' ? 'danger' : 'neutral'}>
                      {g.status === 'SUCCESS' ? 'Başarılı' : g.status === 'FAILED' ? 'Başarısız' : 'Yerel motor'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Markalar */}
      <section className="mt-5 card">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="section-title">Markalar</h2>
            <p className="section-sub">Marka sesi, yasaklı kelimeler ve zorunlu hashtagler içerik üretiminde kullanılır</p>
          </div>
          <Link href="/app/markalar" className="btn-ghost btn-sm">
            Yönet <Icon name="arrowRight" size={14} />
          </Link>
        </header>
        {brands.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon="brand"
              title="Henüz marka profili yok"
              description="İçerik üretmeden önce bir marka oluşturun; ton, hedef kitle ve yasaklı kelimeler metinlerinize uygulanır."
              action={
                <Link href="/app/markalar" className="btn-primary btn-md">
                  <Icon name="plus" size={15} /> Marka Oluştur
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
            {brands.map((b) => (
              <li key={b.id} className="border-line p-4 sm:border-r">
                <Link href={`/app/markalar/${b.id}`} className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-[13px] font-extrabold text-white"
                    style={{ background: b.primaryColor }}
                  >
                    {b.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold text-ink">{b.name}</span>
                    {b.isDefault && <span className="text-[11px] text-ink-faint">Varsayılan marka</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Yayın modülü açıkken ek panel */}
      {publishingStats && (
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
          <section className="card xl:col-span-2">
            <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="section-title">Bugünün İçerik Planı</h2>
                <p className="section-sub">Saat sırasına göre planlanmış hedefler</p>
              </div>
              <Link href="/app/takvim" className="btn-ghost btn-sm">
                Takvim <Icon name="arrowRight" size={14} />
              </Link>
            </header>
            {publishingStats.todayPlan.length === 0 ? (
              <p className="px-5 py-6 text-center text-[12.5px] text-ink-muted">Bugün için planlanmış içerik yok.</p>
            ) : (
              <ul className="divide-y divide-line">
                {publishingStats.todayPlan.map((item) => (
                  <li key={item.id}>
                    <Link href={`/app/icerik/${item.contentId || item.platformContentId}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-subtle">
                      <span className="w-14 shrink-0 text-center text-[15px] font-extrabold tabular-nums text-ink">
                        {formatTime(item.scheduledFor, user.timezone)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <PlatformIcon platform={item.platform} size={17} />
                          <span className="text-[13px] font-bold text-ink">{item.platformName}</span>
                          <span className="text-[12px] text-ink-faint">· {CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-ink-muted">{item.captionPreview || 'Açıklama henüz yazılmadı'}</span>
                      </span>
                      <StatusPill status={item.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="space-y-5">
            <section className="card">
              <header className="border-b border-line px-5 py-4">
                <h2 className="section-title">Yayın Özeti</h2>
                <p className="section-sub">Yalnızca bu kurulumda yayınlama açık olduğu için gösterilir</p>
              </header>
              <ul className="divide-y divide-line">
                {[
                  ['Bağlı Hesaplar', publishingStats.connectedAccounts],
                  ['Bugün Yayınlanacak', publishingStats.publishingToday],
                  ['Planlanan Gönderiler', publishingStats.scheduledTotal],
                  ['Başarılı Yayınlar', publishingStats.publishedTotal],
                  ['Başarısız Yayınlar', publishingStats.failedTotal],
                  ['Kısmen Yayınlanan', publishingStats.partiallyPublished]
                ].map(([label, value]) => (
                  <li key={String(label)} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-[12.5px] text-ink-muted">{label}</span>
                    <span className="text-[13px] font-bold tabular-nums text-ink">{formatNumber(Number(value))}</span>
                  </li>
                ))}
              </ul>
            </section>
            {recentFailures.length > 0 && (
              <section className="card">
                <header className="border-b border-line px-5 py-4">
                  <h2 className="section-title">Son Hatalar</h2>
                  <p className="section-sub">Yeniden denenebilir</p>
                </header>
                <ul className="divide-y divide-line">
                  {recentFailures.map((f) => (
                    <li key={f.id} className="px-5 py-2.5">
                      <Link href={`/app/icerik/${f.contentId}`} className="flex items-center gap-2">
                        <PlatformIcon platform={f.platform} size={18} />
                        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{f.lastError ?? 'Bilinmeyen hata'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      {/* Hesaplar (yalnızca modül açıkken) */}
      {stats.accountsEnabled && accounts.length > 0 && (
        <section className="mt-5 card">
          <header className="border-b border-line px-5 py-4">
            <h2 className="section-title">Sosyal Hesaplar</h2>
            <p className="section-sub">{accounts.length} hesap tanımlı</p>
          </header>
          <ul className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 p-4">
                <PlatformIcon platform={a.platform} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-ink">{a.displayName}</span>
                  <span className="block truncate text-[11.5px] text-ink-faint">@{a.handle}</span>
                </span>
                <Badge tone={a.connectionStatus === 'ACTIVE' ? 'success' : 'warning'}>
                  {a.connectionStatus === 'ACTIVE' ? 'Aktif' : 'Yeniden bağlan'}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
