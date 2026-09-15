'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, EmptyState, ProgressBar, Segmented, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { formatCompact, formatDate, formatPercent } from '@/lib/format';
import { PLATFORM_META, type PlatformCode } from '@/lib/platforms/platforms';

interface Summary {
  hasData: boolean;
  note: string;
  totals: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    videoViews: number;
    engagementRate: number;
    followerDelta: number;
  };
  byPlatform: { platform: string; label: string; color: string; impressions: number; engagement: number; engagementRate: number }[];
  series: { date: string; impressions: number; engagement: number }[];
  bestContent: { id: string; caption: string; platform: string; impressions: number; engagementRate: number }[];
  insights: string[];
}

interface Daily {
  series: { date: string; published: number; failed: number }[];
  byPlatform: { platform: string; count: number }[];
  total: number;
}

export function AnalyticsView({
  brands,
  timezone,
}: {
  brands: { id: string; name: string }[];
  timezone: string;
}) {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [brandId, setBrandId] = useState('all');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const brandQ = brandId !== 'all' ? `&brandId=${brandId}` : '';
      const [s, d] = await Promise.all([
        api.get<Summary>(`/api/analytics/summary?days=${days}${brandQ}`),
        api.get<Daily>(`/api/analytics/daily?days=${days}`)
      ]);
      setSummary(s);
      setDaily(d);
    } catch (e) {
      toast.error('Analizler yüklenemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setLoading(false);
    }
  }, [days, brandId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const maxDaily = useMemo(() => {
    if (!daily) return 1;
    return Math.max(1, ...daily.series.map((s) => s.published + s.failed));
  }, [daily]);

  const maxPlatform = useMemo(() => {
    if (!daily) return 1;
    return Math.max(1, ...daily.byPlatform.map((p) => p.count));
  }, [daily]);

  const totalPublished = daily?.series.reduce((s, d) => s + d.published, 0) ?? 0;
  const totalFailed = daily?.series.reduce((s, d) => s + d.failed, 0) ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Analizler</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Yayın etkinliği ve — hesaplar resmî API ile bağlandığında — gerçek etkileşim metrikleri.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={[
              { value: '7', label: '7 gün' },
              { value: '30', label: '30 gün' },
              { value: '90', label: '90 gün' }
            ]}
          />
          <select className="select w-auto min-w-[140px]" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="all">Tüm markalar</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && !summary ? (
        <div className="card flex items-center justify-center gap-2 p-10 text-ink-muted">
          <Spinner size={18} /> Yükleniyor…
        </div>
      ) : (
        <>
          {/* Yayın etkinliği — her zaman gerçek (uygulamanın kendi kayıtları) */}
          <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
            <section className="card xl:col-span-2">
              <header className="border-b border-line px-5 py-4">
                <h2 className="section-title">Yayın Etkinliği</h2>
                <p className="section-sub">
                  Son {days} günde yayınlanan {totalPublished} hedef
                  {totalFailed > 0 && <span className="text-danger"> · {totalFailed} başarısız</span>}
                </p>
              </header>
              <div className="p-5">
                {!daily || daily.series.length === 0 ? (
                  <EmptyState icon="chart" title="Bu dönemde yayın yok" description="Seçili aralıkta yayınlanmış içerik bulunmuyor." />
                ) : (
                  <div className="flex h-[180px] items-end gap-1">
                    {daily.series.map((d) => {
                      const h = ((d.published + d.failed) / maxDaily) * 100;
                      const fh = (d.failed / maxDaily) * 100;
                      return (
                        <div key={d.date} className="group relative flex flex-1 flex-col justify-end" title={`${formatDate(d.date, timezone)}: ${d.published} yayın${d.failed ? `, ${d.failed} hata` : ''}`}>
                          <div className="flex w-full flex-col justify-end" style={{ height: `${Math.max(h, 2)}%` }}>
                            {d.failed > 0 && <div className="w-full rounded-t bg-danger" style={{ height: `${(fh / h) * 100}%` }} />}
                            <div className="w-full bg-brand-500 transition-colors group-hover:bg-brand-600" style={{ height: `${((h - fh) / h) * 100}%`, minHeight: d.published ? 2 : 0 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="card">
              <header className="border-b border-line px-5 py-4">
                <h2 className="section-title">Platform Dağılımı</h2>
                <p className="section-sub">Yayınlanan hedef sayısı</p>
              </header>
              <div className="space-y-3 p-5">
                {!daily || daily.byPlatform.length === 0 ? (
                  <EmptyState icon="grid" title="Veri yok" description="Henüz yayın yapılmadı." />
                ) : (
                  daily.byPlatform
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((p) => (
                      <div key={p.platform}>
                        <div className="mb-1 flex items-center justify-between text-[12.5px]">
                          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                            <PlatformIcon platform={p.platform} size={16} rounded="sm" muted />
                            {PLATFORM_META[p.platform as PlatformCode]?.name ?? p.platform}
                          </span>
                          <span className="text-ink-faint">{p.count}</span>
                        </div>
                        <ProgressBar value={p.count} max={maxPlatform} />
                      </div>
                    ))
                )}
              </div>
            </section>
          </div>

          {/* Etkileşim metrikleri — yalnızca gerçek API verisi varsa */}
          <section className="card mb-5">
            <header className="border-b border-line px-5 py-4">
              <h2 className="section-title">Etkileşim Metrikleri</h2>
              <p className="section-sub">Görüntüleme, erişim, beğeni, yorum ve tıklama</p>
            </header>
            {!summary?.hasData ? (
              <div className="p-6">
                <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
                  <span className="mt-0.5 text-warning">
                    <Icon name="shield" size={18} />
                  </span>
                  <div>
                    <p className="text-[13px] font-bold text-ink">Gerçek etkileşim verisi yok</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-muted">{summary?.note}</p>
                    <Link href="/app/hesaplar" className="btn-secondary btn-sm mt-3">
                      <Icon name="users" size={14} /> Hesapları Bağla
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <MetricCard label="Görüntüleme" value={formatCompact(summary.totals.impressions)} icon="eye" />
                  <MetricCard label="Erişim" value={formatCompact(summary.totals.reach)} icon="users" />
                  <MetricCard label="Etkileşim Oranı" value={formatPercent(summary.totals.engagementRate)} icon="zap" />
                  <MetricCard label="Tıklama" value={formatCompact(summary.totals.clicks)} icon="link" />
                  <MetricCard label="Video İzlenme" value={formatCompact(summary.totals.videoViews)} icon="video" />
                </div>

                {summary.byPlatform.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Platforma Göre Etkileşim</h3>
                    <div className="space-y-2">
                      {summary.byPlatform.map((p) => (
                        <div key={p.platform} className="flex items-center gap-3">
                          <span className="inline-flex w-32 items-center gap-1.5 text-[12.5px] font-medium text-ink">
                            <PlatformIcon platform={p.platform} size={16} rounded="sm" muted />
                            {p.label}
                          </span>
                          <div className="flex-1">
                            <ProgressBar value={p.engagementRate} max={Math.max(...summary.byPlatform.map((x) => x.engagementRate), 1)} />
                          </div>
                          <span className="w-16 text-right text-[12px] text-ink-faint">{formatPercent(p.engagementRate)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {summary.bestContent.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-faint">En İyi Performans</h3>
                    <ul className="divide-y divide-line">
                      {summary.bestContent.map((b) => (
                        <li key={b.id} className="flex items-center gap-3 py-2">
                          <PlatformIcon platform={b.platform} size={20} rounded="sm" muted />
                          <span className="line-clamp-1 flex-1 text-[12.5px] text-ink-muted">{b.caption}</span>
                          <Badge tone="neutral">{formatCompact(b.impressions)} gör.</Badge>
                          <span className="w-14 text-right text-[12px] font-semibold text-ink">{formatPercent(b.engagementRate)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* İçgörüler */}
          <section className="card">
            <header className="border-b border-line px-5 py-4">
              <h2 className="section-title">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="sparkles" size={15} /> Yapay Zeka İçgörüleri
                </span>
              </h2>
              <p className="section-sub">Verilerinize dayalı otomatik öneriler</p>
            </header>
            <ul className="divide-y divide-line">
              {(summary?.insights ?? []).map((ins, i) => (
                <li key={i} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                    <Icon name="info" size={13} />
                  </span>
                  <p className="text-[13px] leading-relaxed text-ink-muted">{ins}</p>
                </li>
              ))}
            </ul>
          </section>

        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-subtle p-3">
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-faint">
        <Icon name={icon} size={13} /> {label}
      </span>
      <p className="stat-value mt-1.5 text-[20px]">{value}</p>
    </div>
  );
}
