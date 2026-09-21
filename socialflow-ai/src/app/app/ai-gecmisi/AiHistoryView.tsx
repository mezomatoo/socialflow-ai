'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui';

const mockHistory = [
  { id:'h1', service:'captionGeneration', prompt:'Yeni sezon kahve lansmanı', output:'Her yudumda bir hikâye...', brand:'Kahve Dükkanı', user:'Yönetici', date:'2026-09-14 10:30', status:'DONE', liked: true },
  { id:'h2', service:'imageGeneration', prompt:'Premium siyah arka plan kahve', output:'4 görsel üretildi', brand:'Kahve Dükkanı', user:'Yönetici', date:'2026-09-14 09:15', status:'DONE', liked: false },
  { id:'h3', service:'contentPlanner', prompt:'Haftalık plan', output:'6 içerik önerisi', brand:'Aurora Tekstil', user:'Ayşe', date:'2026-09-13 16:00', status:'DONE', liked: null },
];

export function AiHistoryView() {
  const [filter, setFilter] = useState('all');
  const items = filter==='all' ? mockHistory : mockHistory.filter((h)=>h.service===filter);
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">AI Geçmişi</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">Tüm AI etkileşimleriniz, prompt bağlamınız, çıktılarınız ve geri bildirimleriniz.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { id:'all', label:'Tümü' },
          { id:'captionGeneration', label:'Caption' },
          { id:'imageGeneration', label:'Görsel' },
          { id:'contentPlanner', label:'Planlayıcı' },
        ].map((f)=>(
          <button key={f.id} onClick={()=>setFilter(f.id)} className={`chip ${filter===f.id ? 'chip-active':''}`}>{f.label}</button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {items.map((h)=>(
          <div key={h.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{h.service}</Badge>
              <Badge tone={h.status==='DONE' ? 'success':'warning'}>{h.status}</Badge>
              <span className="text-[12.5px] text-ink-muted">{h.date} • {h.brand} • {h.user}</span>
              <span className="ml-auto flex gap-1">
                <button className="btn-ghost btn-sm"><Icon name="thumbsUp" size={13}/> Beğendim</button>
                <button className="btn-ghost btn-sm"><Icon name="thumbsDown" size={13}/> Beğenmedim</button>
              </span>
            </div>
            <p className="mt-2 text-[13px]"><strong>Prompt:</strong> {h.prompt}</p>
            <p className="mt-1 rounded-lg bg-surface-subtle p-2.5 text-[13px]">{h.output}</p>
            <div className="mt-2 flex gap-2 text-[12px]">
              <button className="chip">Markaya Uygun</button>
              <button className="chip">Markaya Uygun Değil</button>
            </div>
          </div>
        ))}
        {items.length===0 ? <p className="card p-8 text-center text-ink-muted">Kayıt yok.</p> : null}
      </div>

      <div className="mt-6 card p-4">
        <h3 className="section-title">Maliyet Özeti (mock)</h3>
        <div className="mt-2 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-line p-3"><p className="text-[11px] text-ink-faint">Bu Ay</p><p className="text-[18px] font-bold">12.40 $</p><p className="text-[11px]">42 istek</p></div>
          <div className="rounded-lg border border-line p-3"><p className="text-[11px] text-ink-faint">Görsel</p><p className="text-[18px] font-bold">18</p><p className="text-[11px]">adet</p></div>
          <div className="rounded-lg border border-line p-3"><p className="text-[11px] text-ink-faint">Token</p><p className="text-[18px] font-bold">24.3k</p><p className="text-[11px]">toplam</p></div>
        </div>
      </div>
    </div>
  );
}
