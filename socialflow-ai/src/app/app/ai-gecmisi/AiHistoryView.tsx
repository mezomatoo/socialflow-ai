'use client';

import { useMemo, useState } from 'react';
import { Badge, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api } from '@/lib/client/api';

/**
 * AI Geçmişi — GERÇEK AiGeneration / AiUsage kayıtları (Faz 7 §11/§13).
 * Sahte geçmiş listesi ve "mock" maliyet özeti kaldırıldı; tüm satırlar
 * veritabanından gelir. Geri bildirimler /api/ai/feedback uçlarına yazılır.
 */

export interface HistoryItem {
  id: string;
  type: string;
  provider: string;
  model: string | null;
  status: string;
  errorCode: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number | null;
  createdAt: string;
  brandName: string | null;
  rating: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  ADAPT_CAPTION: 'Caption Uyarlama',
  GENERATE_CAPTION: 'Caption Üretimi',
  HASHTAGS: 'Hashtag Önerisi',
  SPELLCHECK: 'Yazım Denetimi',
  VARIANT_COPY: 'Varyant Metni',
  STUDIO_IMAGE: 'Stüdyo Görseli',
  IMAGE_EDIT: 'Görsel Düzenleme',
  SMART_RESIZE: 'Akıllı Yeniden Boyutlandırma',
  PLANNER_PLAN: 'AI Planlayıcı',
  CAMPAIGN_CONCEPT: 'AI Kampanya',
  DAILY_ASSISTANT: 'Günlük Asistan'
};

const STATUS_LABELS: Record<string, { label: string; tone: 'success' | 'danger' | 'neutral' }> = {
  SUCCESS: { label: 'Tamamlandı', tone: 'success' },
  FAILED: { label: 'Başarısız', tone: 'danger' },
  SKIPPED: { label: 'Atlandı', tone: 'neutral' }
};

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function AiHistoryView({
  items,
  usage
}: {
  items: HistoryItem[];
  usage: { totalCost: number; totalImages: number; totalTokens: number; requests: number };
}) {
  const toast = useToast();
  const [filter, setFilter] = useState<string>('all');
  const [pending, setPending] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, string | null>>(
    () => Object.fromEntries(items.map((i) => [i.id, i.rating]))
  );

  const types = useMemo(() => {
    const set = new Map<string, string>();
    for (const i of items) set.set(i.type, TYPE_LABELS[i.type] ?? i.type);
    return [...set.entries()];
  }, [items]);

  const visible = filter === 'all' ? items : items.filter((i) => i.type === filter);

  async function sendFeedback(item: HistoryItem, rating: 'LIKED' | 'DISLIKED') {
    setPending(item.id);
    try {
      await api.post('/api/ai/feedback', { rating, service: item.type, outputId: item.id });
      setRatings((prev) => ({ ...prev, [item.id]: prev[item.id] === rating ? null : rating }));
      toast.success('Geri bildiriminiz kaydedildi');
    } catch (e) {
      toast.error('Kaydedilemedi', e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">AI Geçmişi</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">
        Yapay zeka etkileşimlerinizin gerçek kayıtları: sağlayıcı, süre, token kullanımı ve geri bildirimleriniz.
      </p>

      {types.length > 1 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setFilter('all')} className={`chip ${filter === 'all' ? 'chip-active' : ''}`}>Tümü</button>
          {types.map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} className={`chip ${filter === id ? 'chip-active' : ''}`}>{label}</button>
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {visible.length === 0 ? (
          <p className="card p-8 text-center text-ink-muted">
            Henüz AI etkileşimi kaydı yok. AI asistanı, stüdyo veya planlayıcı kullandığınızda işlemleriniz burada listelenir.
          </p>
        ) : (
          visible.map((h) => {
            const status = STATUS_LABELS[h.status] ?? { label: h.status, tone: 'neutral' as const };
            return (
              <div key={h.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{TYPE_LABELS[h.type] ?? h.type}</Badge>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span className="text-[12.5px] text-ink-muted">
                    {new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(h.createdAt))}
                    {h.brandName ? ` • ${h.brandName}` : ''} • {h.provider}{h.model ? `/${h.model}` : ''}
                    {h.durationMs != null ? ` • ${(h.durationMs / 1000).toFixed(1)} sn` : ''}
                    {h.tokensIn || h.tokensOut ? ` • ${formatTokens((h.tokensIn ?? 0) + (h.tokensOut ?? 0))} token` : ''}
                  </span>
                  <span className="ml-auto flex gap-1">
                    <button
                      className={`chip ${ratings[h.id] === 'LIKED' ? 'chip-active' : ''}`}
                      disabled={pending === h.id}
                      onClick={() => void sendFeedback(h, 'LIKED')}
                    >
                      Beğendim
                    </button>
                    <button
                      className={`chip ${ratings[h.id] === 'DISLIKED' ? 'chip-active' : ''}`}
                      disabled={pending === h.id}
                      onClick={() => void sendFeedback(h, 'DISLIKED')}
                    >
                      Beğenmedim
                    </button>
                    {pending === h.id ? <Spinner size={12} /> : null}
                  </span>
                </div>
                {h.status === 'FAILED' && h.errorCode ? (
                  <p className="mt-2 rounded-lg bg-danger/5 p-2.5 text-[12.5px] text-ink-muted">Hata kodu: {h.errorCode}</p>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-6 card p-4">
        <h3 className="section-title">Bu Ayın Kullanım Özeti</h3>
        <p className="section-sub">Gerçek AiUsage kayıtlarından hesaplanır.</p>
        <div className="mt-2 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-line p-3">
            <p className="text-[11px] text-ink-faint">Maliyet</p>
            <p className="text-[18px] font-bold">${usage.totalCost.toFixed(2)}</p>
            <p className="text-[11px]">{usage.requests} istek</p>
          </div>
          <div className="rounded-lg border border-line p-3">
            <p className="text-[11px] text-ink-faint">Görsel</p>
            <p className="text-[18px] font-bold">{usage.totalImages}</p>
            <p className="text-[11px]">adet</p>
          </div>
          <div className="rounded-lg border border-line p-3">
            <p className="text-[11px] text-ink-faint">Token</p>
            <p className="text-[18px] font-bold">{formatTokens(usage.totalTokens)}</p>
            <p className="text-[11px]">toplam</p>
          </div>
        </div>
      </div>
    </div>
  );
}
