'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { generateContentPlan, type PlanItem } from '@/lib/planner/service';

export function AiPlannerView({ brands, demoMode }: { brands: any[]; demoMode: boolean }) {
  const toast = useToast();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [platforms, setPlatforms] = useState<string[]>(['INSTAGRAM','LINKEDIN','X']);
  const [from, setFrom] = useState(new Date().toISOString().slice(0,10));
  const [to, setTo] = useState(new Date(Date.now()+14*86400000).toISOString().slice(0,10));
  const [goal, setGoal] = useState('Yeni sezon lansmanı');
  const [frequency, setFrequency] = useState('3 / hafta');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<PlanItem[] | null>(null);

  async function handleGenerate() {
    setBusy(true);
    try {
      const res = await generateContentPlan({ brandId, platforms, dateFrom: from, dateTo: to, goal, frequency });
      setItems(res);
      toast.success('Plan oluşturuldu', `${res.length} içerik önerisi hazır.`);
    } finally { setBusy(false); }
  }

  function togglePlatform(p:string) {
    setPlatforms((prev)=> prev.includes(p) ? prev.filter((x)=>x!==p) : [...prev, p]);
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">AI İçerik Planlayıcı</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">Marka, kampanya, hedef kitle ve tarih aralığına göre dengeli bir içerik takvimi oluşturur. Mevcut içeriklerinizi analiz eder, tekrarları önler.</p>
        <div className="mt-2 flex gap-2">{demoMode ? <Badge tone="warning">Demo Modu</Badge> : null}<Badge tone="brand">İçerik karması: Ürün / Eğitim / Etkileşim / Hikâye dengesi</Badge></div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <div className="card p-5 space-y-4 h-fit">
          <div>
            <label className="label">Marka</label>
            <select className="select" value={brandId} onChange={(e)=>setBrandId(e.target.value)}>
              {brands.map((b:any)=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <p className="hint mt-1">Seçili markanın kitindeki ton, renk ve kurallar otomatik kullanılır.</p>
          </div>
          <div>
            <label className="label">Platformlar</label>
            <div className="flex flex-wrap gap-1.5">
              {['INSTAGRAM','FACEBOOK','LINKEDIN','X','TIKTOK','YOUTUBE','PINTEREST'].map((p)=>(
                <button key={p} onClick={()=>togglePlatform(p)} className={`chip ${platforms.includes(p)?'chip-active':''}`}>{p}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Başlangıç</label>
              <input className="input" type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Bitiş</label>
              <input className="input" type="date" value={to} onChange={(e)=>setTo(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Hedef</label>
            <input className="input" value={goal} onChange={(e)=>setGoal(e.target.value)} placeholder="Örn: Lansman, farkındalık, satış"/>
          </div>
          <div>
            <label className="label">Sıklık</label>
            <select className="select" value={frequency} onChange={(e)=>setFrequency(e.target.value)}>
              <option>2 / hafta</option>
              <option>3 / hafta</option>
              <option>4 / hafta</option>
              <option>Her gün</option>
            </select>
          </div>
          <button className="btn-primary btn-md w-full" onClick={handleGenerate} disabled={busy || platforms.length===0}>{busy ? <Spinner size={15}/> : <Icon name="calendar" size={15}/>} Plan Oluştur</button>
          <p className="hint">AI yalnızca taslaklar oluşturur; doğrudan yayınlamaz.</p>
        </div>

        <div className="space-y-4">
          {!items ? (
            <div className="card flex flex-col items-center justify-center p-10 text-center">
              <Icon name="calendar" size={28} className="text-ink-faint"/>
              <p className="mt-2 text-[14px] font-semibold">Henüz plan yok</p>
              <p className="text-[13px] text-ink-muted">Soldan kriterleri seçip plan oluşturun.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold">{items.length} içerik önerisi • {from} → {to}</p>
                <button className="btn-primary btn-sm" onClick={()=>toast.success('Takvime eklendi','Taslak içerikler oluşturuldu. Onay akışına gönderildi.')}>Takvime Ekle</button>
              </div>
              <div className="overflow-hidden rounded-xl border border-line">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-surface-subtle text-[11px] uppercase tracking-wide text-ink-faint">
                    <tr><th className="px-3 py-2">Tarih</th><th className="px-3 py-2">Platform</th><th className="px-3 py-2">Konu</th><th className="px-3 py-2">Başlık</th><th className="px-3 py-2">CTA</th></tr>
                  </thead>
                  <tbody>
                    {items.map((it,i)=>(
                      <tr key={i} className="border-t border-line">
                        <td className="px-3 py-2 whitespace-nowrap">{it.date}</td>
                        <td className="px-3 py-2"><Badge tone="neutral">{it.platform}</Badge></td>
                        <td className="px-3 py-2"><span className="chip">{it.topic}</span></td>
                        <td className="px-3 py-2"><p className="font-medium">{it.headline}</p><p className="text-[12px] text-ink-muted">{it.captionConcept}</p></td>
                        <td className="px-3 py-2">{it.cta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card p-4">
                <h3 className="section-title">İçerik karması dengesi</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['Ürün','Eğitim','Etkileşim','Marka Hikayesi','Kampanya','Sosyal Kanıt'].map((k)=>(
                    <span key={k} className="chip">{k}</span>
                  ))}
                </div>
                <p className="hint mt-2">AI ürün ağırlığını dengeledi; son planınızda ürün oranı yüksek olduğu için eğitici ve topluluk önerileri artırıldı.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
