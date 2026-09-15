'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api } from '@/lib/client/api';

/**
 * AI Planlayıcı görünümü — plan üretimi ve "Takvime Ekle" GERÇEK API'ye gider.
 * Plan öğeleri ContentPlanItem kaydıdır; "Takvime Ekle" TASLAK içerik açar,
 * asla otomatik yayın yapmaz (§83).
 */

interface PlanItem {
  id: string;
  date: string;
  timeSuggestion: string;
  platform: string;
  contentType: string;
  topic: string;
  headline: string;
  captionConcept: string;
  creativeConcept: string;
  cta: string;
  hashtags: string[];
  status: string;
  contentId: string | null;
}

interface PlanResult {
  planId: string;
  title: string;
  engine: 'ai' | 'deterministic';
  engineLabel: string;
  dataBasis: 'INSUFFICIENT_HISTORY' | 'RECENT_HISTORY';
  dataBasisNote: string;
  duplicatesAvoided: number;
  items: PlanItem[];
}

const PLATFORM_OPTIONS = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'THREADS'];

export function AiPlannerView({
  brands,
  campaigns,
  demoMode
}: {
  brands: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
  demoMode: boolean;
}) {
  const toast = useToast();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [campaignId, setCampaignId] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['INSTAGRAM', 'LINKEDIN', 'X']);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [goal, setGoal] = useState('');
  const [frequency, setFrequency] = useState('3 / hafta');
  const [audience, setAudience] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [applied, setApplied] = useState<Record<string, string>>({});

  async function handleGenerate() {
    if (!brandId) {
      toast.error('Marka seçin', 'Plan bir markaya bağlı olmalıdır.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<PlanResult>('/api/v1/ai/planner/generate', {
        brandId,
        platforms,
        dateFrom: from,
        dateTo: to,
        campaignId: campaignId || undefined,
        goal: goal || undefined,
        frequency
      });
      setPlan(result);
      setApplied({});
      toast.success('Plan oluşturuldu', `${result.items.length} içerik önerisi kaydedildi.`);
    } catch (e) {
      toast.error('Plan oluşturulamadı', e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApply(item: PlanItem) {
    try {
      const res = await api.post<{ contentId: string }>(`/api/v1/ai/planner/items/${item.id}/apply`);
      setApplied((cur) => ({ ...cur, [item.id]: res.contentId }));
      toast.success('Taslak oluşturuldu', 'İçerik Taslaklar listesinde; yayınlama sizin kararınıza bağlı.');
    } catch (e) {
      toast.error('Eklenemedi', e instanceof Error ? e.message : 'Beklenmeyen hata.');
    }
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">AI Planlayıcı</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
          Marka, kampanya ve tarih aralığına göre dengeli bir içerik planı oluşturur. Planlar kaydedilir;
          “Takvime Ekle” ile taslak içerik açabilirsiniz — hiçbir şey otomatik yayınlanmaz.
        </p>
        <div className="mt-2 flex gap-2">
          {demoMode ? <Badge tone="warning">Demo Modu</Badge> : null}
          {plan ? <Badge tone={plan.engine === 'ai' ? 'brand' : 'neutral'}>{plan.engineLabel}</Badge> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <div className="card h-fit space-y-4 p-5">
          <div>
            <label className="label">Marka</label>
            <select className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <p className="hint mt-1">Marka kitindeki ton, onaylı CTA ve hashtagler otomatik kullanılır.</p>
          </div>
          {campaigns.length ? (
            <div>
              <label className="label">Kampanya (opsiyonel)</label>
              <select className="select" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">Bağımsız plan</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="label">Platformlar</label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORM_OPTIONS.map((p) => (
                <button key={p} onClick={() => togglePlatform(p)} className={`chip ${platforms.includes(p) ? 'chip-active' : ''}`}>{p}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Başlangıç</label>
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Bitiş</label>
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Hedef</label>
            <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Örn: Lansman, farkındalık, satış" />
          </div>
          <div>
            <label className="label">Hedef kitle (opsiyonel)</label>
            <input className="input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Örn: 25-40 yaş şehirli profesyoneller" />
          </div>
          <div>
            <label className="label">Sıklık</label>
            <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option>2 / hafta</option>
              <option>3 / hafta</option>
              <option>4 / hafta</option>
              <option>Her gün</option>
            </select>
          </div>
          <button className="btn-primary btn-md w-full" onClick={handleGenerate} disabled={busy || platforms.length === 0}>
            {busy ? <Spinner size={15} /> : <Icon name="calendar" size={15} />} Plan Oluştur
          </button>
          <p className="hint">Plan yalnızca öneri üretir; yayın yapmaz. Her öğeyi tek tek takvime ekleyebilirsiniz.</p>
        </div>

        <div className="space-y-4">
          {!plan ? (
            <div className="card flex flex-col items-center justify-center p-10 text-center">
              <Icon name="calendar" size={28} className="text-ink-faint" />
              <p className="mt-2 text-[14px] font-semibold">Henüz plan yok</p>
              <p className="text-[13px] text-ink-muted">Soldan kriterleri seçip plan oluşturun.</p>
            </div>
          ) : (
            <>
              <div className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold">{plan.title}</p>
                  <Badge tone={plan.dataBasis === 'RECENT_HISTORY' ? 'success' : 'info'}>{plan.dataBasisNote}</Badge>
                  {plan.duplicatesAvoided > 0 ? <Badge tone="neutral">{plan.duplicatesAvoided} tekrar öneri elendi</Badge> : null}
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-line">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-surface-subtle text-[11px] uppercase tracking-wide text-ink-faint">
                    <tr>
                      <th className="px-3 py-2">Tarih</th>
                      <th className="px-3 py-2">Platform</th>
                      <th className="px-3 py-2">Konu</th>
                      <th className="px-3 py-2">Konsept</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.items.map((it) => {
                      const contentId = applied[it.id] ?? it.contentId;
                      return (
                        <tr key={it.id} className="border-t border-line">
                          <td className="whitespace-nowrap px-3 py-2">
                            {it.date}
                            <p className="text-[11px] text-ink-faint">{it.timeSuggestion} öneri</p>
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone="neutral">{it.platform}</Badge>
                            <p className="mt-0.5 text-[11px] text-ink-faint">{it.contentType}</p>
                          </td>
                          <td className="px-3 py-2"><span className="chip">{it.topic}</span></td>
                          <td className="px-3 py-2">
                            <p className="font-medium">{it.headline}</p>
                            <p className="text-[12px] text-ink-muted">{it.captionConcept}</p>
                            {it.hashtags.length ? <p className="mt-0.5 text-[11px] text-ink-faint">{it.hashtags.join(' ')}</p> : null}
                          </td>
                          <td className="px-3 py-2">
                            {contentId ? (
                              <a href={`/app/icerik/${contentId}`} className="btn-ghost btn-xs">Taslağı aç</a>
                            ) : (
                              <button className="btn-secondary btn-xs" onClick={() => handleApply(it)}>Takvime Ekle</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="hint">Öğeler “Takvime Ekle” ile TASLAK içerik olarak açılır; onay ve yayınlama mevcut akışınızla sizin kontrolünüzdedir.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
