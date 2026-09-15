'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui';
import { listTrends } from '@/lib/trends/service';

export function TrendsView() {
  const [data, setData] = useState<{ items: any[]; providerConfigured: boolean; warning?: string } | null>(null);

  useEffect(()=>{ listTrends('demo-workspace-id').then(setData); }, []);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Trendler</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">Markanızla ilgili trendleri, içerik fırsatlarını ve tazeliği görün. Canlı trendler yalnızca lisanslı sağlayıcı ile gelir; aksi halde demo verisi gösterilir ve asla sahte trend uydurulmaz.</p>
      {data?.warning ? (
        <div className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-[12.5px] text-ink">
          <strong>Not:</strong> {data.warning}
        </div>
      ) : null}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(data?.items ?? []).map((t:any)=>(
          <div key={t.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[14px] font-bold">{t.title}</h3>
              <Badge tone="brand">{t.platform}</Badge>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-muted">{t.description}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div><p className="text-[11px] text-ink-faint">Alaka</p><p className="font-bold">%{Math.round(t.relevance*100)}</p></div>
              <div><p className="text-[11px] text-ink-faint">Tazelik</p><p className="font-bold">%{Math.round(t.freshness*100)}</p></div>
              <div><p className="text-[11px] text-ink-faint">Kaynak</p><p className="text-[11px] font-semibold">{t.source}</p></div>
            </div>
            {t.opportunity ? <p className="mt-2 rounded-lg bg-success/5 p-2 text-[12px]"><strong>Fırsat:</strong> {t.opportunity}</p> : null}
          </div>
        ))}
      </div>
      <div className="mt-6 card p-4">
        <h3 className="section-title">İçerik Fırsatları (Gap Analizi)</h3>
        <p className="section-sub">Mevcut içerikleriniz, hedef kitle ilgi alanları ve trend verisi karşılaştırıldı.</p>
        <ul className="mt-2 list-disc pl-5 text-[13px]">
          <li>Soğuk demleme eğitici Reels — trendlerle uyumlu</li>
          <li>Sürdürülebilir ambalaj hikayesi — topluluk beklentisi yüksek</li>
        </ul>
      </div>
    </div>
  );
}
