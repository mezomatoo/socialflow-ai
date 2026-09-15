'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Spinner } from '@/components/ui';
import { api } from '@/lib/client/api';

interface UsageRecord {
  id: string;
  provider: string;
  service: string;
  task: string | null;
  tokensIn: number;
  tokensOut: number;
  imageCount: number;
  durationMs: number;
  costUSD: number;
  createdAt: string;
}

interface UsageResponse {
  totalCost: number;
  totalImages: number;
  totalTokens: number;
  records: UsageRecord[];
  provider: string;
  aiMode: string;
  period: string;
}

const SERVICE_LABELS: Record<string, string> = {
  textGeneration: 'Metin üretimi',
  imageGeneration: 'Görsel üretimi',
  imageEditing: 'Görsel düzenleme',
  videoProcessing: 'Video işleme',
  transcription: 'Transkripsiyon',
  embeddings: 'Gömme (embedding)'
};

export function AiUsageView({ demoMode }: { demoMode: boolean }) {
  const [period, setPeriod] = useState<'today' | 'month'>('month');
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<UsageResponse>(`/api/v1/ai/usage?period=${period}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData({ totalCost: 0, totalImages: 0, totalTokens: 0, records: [], provider: 'deterministic', aiMode: '', period });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const tokens = data?.totalTokens ?? 0;
  const images = data?.totalImages ?? 0;
  const cost = data?.totalCost ?? 0;
  const recordCount = data?.records.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">AI Kullanımı ve Maliyet</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          Çalışma alanı bazlı gerçek kullanım kayıtları. Limit aşılsa bile manuel içerik ve yayınlama kesintiye uğramaz.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => setPeriod('today')} className={`chip ${period === 'today' ? 'chip-active' : ''}`}>Bugün</button>
        <button onClick={() => setPeriod('month')} className={`chip ${period === 'month' ? 'chip-active' : ''}`}>Bu Ay</button>
        {demoMode && <Badge tone="info" className="ml-2">Demo Modu</Badge>}
        {data && <Badge tone="neutral" className="ml-1">Sağlayıcı: {data.aiMode || data.provider}</Badge>}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={22} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card card-pad">
              <p className="hint">Toplam Token</p>
              <p className="mt-1 text-[22px] font-extrabold text-ink">{tokens.toLocaleString('tr-TR')}</p>
              <p className="mt-1 text-[12px] text-ink-faint">{period === 'today' ? 'Bugün' : 'Bu ay'} · {recordCount} istek</p>
            </div>
            <div className="card card-pad">
              <p className="hint">Görsel Üretimi</p>
              <p className="mt-1 text-[22px] font-extrabold text-ink">{images} görsel</p>
              <p className="mt-1 text-[11px] text-ink-faint">Bu dönemde kayıtlı görsel üretimi</p>
            </div>
            <div className="card card-pad">
              <p className="hint">Maliyet (USD)</p>
              <p className="mt-1 text-[22px] font-extrabold text-ink">${cost.toFixed(2)}</p>
              <p className="mt-1 text-[11px] text-ink-faint">Harici sağlayıcı kullanımda ise tahmini maliyet</p>
            </div>
          </div>

          <div className="card mt-5">
            <header className="border-b border-line px-5 py-3 flex items-center justify-between">
              <h2 className="section-title">Son AI İstekleri</h2>
              <span className="hint">{recordCount} kayıt</span>
            </header>
            {recordCount === 0 ? (
              <p className="px-5 py-8 text-center text-[12.5px] text-ink-muted">
                Bu dönemde kayıtlı AI kullanımı yok. AI özelliklerini kullandığınızda istekler burada listelenir.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data!.records.slice(0, 50).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[12.5px]">
                    <Badge tone="neutral">{SERVICE_LABELS[r.service] ?? r.service}</Badge>
                    <span className="text-ink-muted">{r.task ?? '—'}</span>
                    <span className="text-ink-faint">{r.provider}</span>
                    <span className="text-ink-faint">{(r.tokensIn + r.tokensOut).toLocaleString('tr-TR')} token</span>
                    <span className="ml-auto text-ink-faint">
                      {new Date(r.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="font-semibold text-ink">${r.costUSD.toFixed(3)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="card card-pad mt-5 border-amber-200 bg-amber-50">
        <div className="flex gap-2">
          <Icon name="info" size={16} className="mt-0.5 text-amber-700" />
          <div className="text-[12.5px] leading-relaxed text-amber-800">
            <p className="font-bold">Limit davranışı</p>
            <p>Aylık limit aşıldığında AI özellikleri duraklatılır ve “Bu ay için AI kullanım limitine ulaştınız.” mesajı gösterilir. Mevcut içerikleriniz, medya kütüphaneniz ve planlı yayınlarınız etkilenmez.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
