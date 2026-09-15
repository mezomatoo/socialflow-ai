'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui';
import { listCompetitors, listInsights, COMPETITOR_WARNING, type CompetitorInsight, type CompetitorProfile } from '@/lib/competitor/service';

/**
 * Rakip Analizi görünümü — DÜRÜST MOD (Faz 7 §13).
 * Veri kaynağı yapılandırılmadıysa SAHTE RAKİP/İÇGÖRÜ GÖSTERİLMEZ.
 * Çalışmayan “Rakip Ekle” düğmesi ve hardcoded sahte fırsat maddeleri kaldırıldı.
 */
export function CompetitorView() {
  const [competitors, setCompetitors] = useState<CompetitorProfile[]>([]);
  const [insights, setInsights] = useState<CompetitorInsight[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void listCompetitors('mevcut-calisma-alani').then(setCompetitors);
    void listInsights('mevcut-calisma-alani').then(setInsights);
  }, []);

  const filtered = selected ? insights.filter((i) => i.competitorId === selected) : insights;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Rakip Analizi</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
        Yalnızca resmi API, izinli açık veri veya sizin eklediğiniz veriler kullanılır. İzinsiz kazıma yapılmaz.
      </p>
      <div className="mt-3 rounded-xl border border-line bg-surface-subtle p-3 text-[12.5px] text-ink-muted">{COMPETITOR_WARNING}</div>

      {competitors.length === 0 ? (
        <div className="mt-5 card p-8 text-center">
          <p className="text-[14px] font-semibold">Henüz gösterilecek rakip verisi yok</p>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-ink-muted">
            Rakip veri kaynağı bu kurulumda yapılandırılmadı. Resmî bir sağlayıcı bağlandığında rakipler ve
            içerik içgörüleri burada listelenir; bu olana kadar sahte rakip verisi gösterilmez.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
          <div className="card p-4">
            <h3 className="section-title">Rakipler</h3>
            <ul className="mt-2 space-y-2">
              <li>
                <button
                  onClick={() => setSelected(null)}
                  className={`w-full rounded-lg border p-3 text-left ${!selected ? 'border-brand-300 bg-brand-50' : 'border-line'}`}
                >
                  <p className="font-semibold">Tümü</p>
                  <p className="text-[12px] text-ink-muted">{insights.length} içgörü</p>
                </button>
              </li>
              {competitors.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c.id)}
                    className={`w-full rounded-lg border p-3 text-left ${selected === c.id ? 'border-brand-300 bg-brand-50' : 'border-line'}`}
                  >
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-[12px] text-ink-muted">{c.handle} • {c.platform}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            {filtered.map((ins) => (
              <div key={ins.id} className="card p-4">
                <div className="flex items-center gap-2">
                  <Badge tone={ins.type === 'GAP' ? 'warning' : ins.type === 'OPPORTUNITY' ? 'success' : 'neutral'}>{ins.type}</Badge>
                  <h3 className="font-semibold">{ins.title}</h3>
                </div>
                <p className="mt-1 text-[13px] text-ink-muted">{ins.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
