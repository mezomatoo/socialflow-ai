'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui';

export function AiUsageView({ demoMode }: { demoMode: boolean }) {
  const [period, setPeriod] = useState<'today' | 'month'>('month');
  // Mock data — gerçekte /api/ai/usage üzerinden DB'den gelir
  const mock = {
    today: { tokens: 18420, images: 6, videos: 0, cost: 1.42, records: 12 },
    month: { tokens: 247_800, images: 42, videos: 3, cost: 12.40, records: 118 },
  };
  const data = mock[period];
  const limits = { monthlyBudgetUSD: 50, monthlyImageLimit: 200 };
  const budgetPct = Math.round((data.cost / limits.monthlyBudgetUSD) * 100);
  const imagePct = Math.round((mock.month.images / limits.monthlyImageLimit) * 100);
  const exceeded = data.cost >= limits.monthlyBudgetUSD || mock.month.images >= limits.monthlyImageLimit;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">AI Kullanımı ve Maliyet</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">Workspace bazlı kullanım. Limit aşılsa bile manuel içerik ve yayınlama kesintiye uğramaz.</p>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => setPeriod('today')} className={`chip ${period === 'today' ? 'chip-active' : ''}`}>Bugün</button>
        <button onClick={() => setPeriod('month')} className={`chip ${period === 'month' ? 'chip-active' : ''}`}>Bu Ay</button>
        {demoMode && <Badge tone="info" className="ml-2">Demo Modu</Badge>}
        {exceeded && <Badge tone="danger"><Icon name="alert-triangle" size={12} /> Limit aşıldı</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card card-pad">
          <p className="hint">Toplam Token</p>
          <p className="mt-1 text-[22px] font-extrabold text-ink">{data.tokens.toLocaleString('tr-TR')}</p>
          <p className="mt-1 text-[12px] text-ink-faint">{period === 'today' ? 'Bugün' : 'Bu ay'} · {data.records} istek</p>
        </div>
        <div className="card card-pad">
          <p className="hint">Görsel Üretimi</p>
          <p className="mt-1 text-[22px] font-extrabold text-ink">{period === 'today' ? data.images : mock.month.images} görsel</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line"><div className="h-full bg-brand-600" style={{ width: `${Math.min(100, imagePct)}%` }} /></div>
          <p className="mt-1 text-[11px] text-ink-faint">{imagePct}% aylık limit ({limits.monthlyImageLimit} görsel)</p>
        </div>
        <div className="card card-pad">
          <p className="hint">Maliyet (USD)</p>
          <p className="mt-1 text-[22px] font-extrabold text-ink">${data.cost.toFixed(2)}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line"><div className={`h-full ${budgetPct >= 90 ? 'bg-danger' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, budgetPct)}%` }} /></div>
          <p className="mt-1 text-[11px] text-ink-faint">{budgetPct}% aylık bütçe (${limits.monthlyBudgetUSD})</p>
        </div>
      </div>

      <div className="card mt-5">
        <header className="border-b border-line px-5 py-3 flex items-center justify-between">
          <h2 className="section-title">Son AI İstekleri</h2>
          <span className="hint">{data.records} kayıt</span>
        </header>
        <ul className="divide-y divide-line">
          {[
            { id: '1', task: 'captionGeneration', model: 'gpt-4o-mini', tokens: 420, cost: 0.018, at: 'Bugün 14:32' },
            { id: '2', task: 'imageGeneration', model: 'dall-e-3', tokens: 0, cost: 0.04, at: 'Bugün 11:10' },
            { id: '3', task: 'contentPlanner', model: 'gpt-4o', tokens: 1820, cost: 0.09, at: 'Dün 16:05' },
          ].slice(0, period === 'today' ? 2 : 3).map(r => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-[12.5px]">
              <Badge tone="neutral">{r.task}</Badge>
              <span className="text-ink-muted">{r.model}</span>
              <span className="ml-auto text-ink-faint">{r.at}</span>
              <span className="font-semibold text-ink">${r.cost.toFixed(3)}</span>
            </li>
          ))}
        </ul>
      </div>

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
