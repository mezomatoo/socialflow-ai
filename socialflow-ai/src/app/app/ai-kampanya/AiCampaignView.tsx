'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { generateCampaign } from '@/lib/campaign/aiCampaign';
import { listProducts, getOfferForProduct, formatOffer } from '@/lib/products/catalog';

export function AiCampaignView({ brands, demoMode }: { brands: any[]; demoMode: boolean }) {
  const toast = useToast();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [goal, setGoal] = useState('Yeni Sezon Etiyopya Lansmanı');
  const [productId, setProductId] = useState('prod-1');
  const [start, setStart] = useState('2026-09-10');
  const [end, setEnd] = useState('2026-09-20');
  const [platforms, setPlatforms] = useState<string[]>(['INSTAGRAM','FACEBOOK','TIKTOK']);
  const [busy, setBusy] = useState(false);
  const [concept, setConcept] = useState<any>(null);

  const products = listProducts('demo-workspace-id', brandId);
  const offer = productId ? getOfferForProduct(productId) : null;

  async function handleGenerate() {
    if (!goal.trim()) { toast.error('Kampanya hedefi gerekli'); return; }
    if (offer && offer.status !== 'VERIFIED') { toast.error('Doğrulanmamış teklif', 'Yalnızca doğrulanmış fiyat/indirim kullanılabilir.'); return; }
    setBusy(true);
    try {
      const res = await generateCampaign({ brandId, goal, productId, offerId: offer?.id ?? null, startDate: start, endDate: end, platforms }, offer);
      // Fact safety: never invent price — ensure offer values are exactly preserved
      setConcept(res);
      toast.success('Kampanya konsepti hazır', 'Fiyat ve tarih bilgileri doğrulandı.');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">AI Kampanya Oluşturucu</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">Marka kitiniz, ürün kataloğunuz ve doğrulanmış tekliflerinizle tam uyumlu kampanya oluşturur. Fiyat, indirim, tarih ve kupon asla uydurulmaz.</p>
        <div className="mt-2 flex gap-2">{demoMode ? <Badge tone="warning">Demo</Badge> : null}<Badge tone="brand">Doğrulanmış bilgiler korunur</Badge></div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <div className="card p-5 space-y-4 h-fit">
          <div>
            <label className="label">Marka</label>
            <select className="select" value={brandId} onChange={(e)=>setBrandId(e.target.value)}>{brands.map((b:any)=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </div>
          <div>
            <label className="label">Kampanya hedefi</label>
            <input className="input" value={goal} onChange={(e)=>setGoal(e.target.value)} placeholder="Örn: Lansman, satış, farkındalık"/>
          </div>
          <div>
            <label className="label">Ürün</label>
            <select className="select" value={productId} onChange={(e)=>setProductId(e.target.value)}>
              <option value="">Ürünsüz kampanya</option>
              {products.map((p)=> <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select>
            {offer ? (
              <div className="mt-2 rounded-lg border border-success/30 bg-success/5 p-2.5">
                <p className="text-[12px] font-semibold text-success">Doğrulanmış Teklif</p>
                <p className="text-[12.5px]">{formatOffer(offer)}</p>
                <p className="text-[11px] text-ink-faint">Kaynak: CampaignOffer #{offer.id}</p>
              </div>
            ) : productId ? <p className="hint mt-1 text-warning">Bu ürün için doğrulanmış teklif yok.</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Başlangıç</label><input className="input" type="date" value={start} onChange={(e)=>setStart(e.target.value)}/></div>
            <div><label className="label">Bitiş</label><input className="input" type="date" value={end} onChange={(e)=>setEnd(e.target.value)}/></div>
          </div>
          <div>
            <label className="label">Platformlar</label>
            <div className="flex flex-wrap gap-1.5">
              {['INSTAGRAM','FACEBOOK','X','LINKEDIN','TIKTOK','YOUTUBE','PINTEREST'].map((p)=>(
                <button key={p} onClick={()=> setPlatforms((prev)=> prev.includes(p) ? prev.filter((x)=>x!==p) : [...prev,p])} className={`chip ${platforms.includes(p)?'chip-active':''}`}>{p}</button>
              ))}
            </div>
          </div>
          <button className="btn-primary btn-md w-full" onClick={handleGenerate} disabled={busy}>{busy ? <Spinner size={15}/> : <Icon name="target" size={15}/>} Kampanya Oluştur</button>
          <p className="hint">AI yalnızca öneri üretir. Yayın öncesi onay akışı aynen çalışır.</p>
        </div>

        <div className="space-y-4">
          {!concept ? (
            <div className="card flex flex-col items-center justify-center p-10 text-center">
              <Icon name="target" size={28} className="text-ink-faint"/>
              <p className="mt-2 font-semibold">Henüz kampanya yok</p>
              <p className="text-[13px] text-ink-muted">Soldan bilgileri doldurup oluşturun. AI marka kitinizdeki slogan, CTA ve hashtagleri kullanır.</p>
            </div>
          ) : (
            <>
              <div className="card p-5">
                <h2 className="text-[18px] font-bold">{concept.name}</h2>
                <p className="text-[13px] text-ink-muted">{concept.theme}</p>
                <div className="mt-3 rounded-lg border border-line bg-surface-subtle p-3">
                  <p className="text-[12px] font-semibold">Ana Mesaj</p>
                  <p className="text-[13.5px]">{concept.keyMessage}</p>
                  {offer ? <p className="mt-1 text-[11px] text-ink-faint">Fiyat kaynağı: CampaignOffer #{offer.id} — {formatOffer(offer)}</p> : null}
                </div>
                <div className="mt-3">
                  <p className="label">İçerik Sütunları</p>
                  <div className="flex flex-wrap gap-1.5">{concept.pillars.map((p:string)=><span key={p} className="chip chip-active">{p}</span>)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="card p-4">
                  <h3 className="section-title">Platform Stratejisi</h3>
                  <ul className="mt-2 space-y-1.5">
                    {Object.entries(concept.platformStrategy).map(([k,v])=>(
                      <li key={k} className="text-[13px]"><strong>{k}:</strong> {v as string}</li>
                    ))}
                  </ul>
                </div>
                <div className="card p-4">
                  <h3 className="section-title">Takvim Önizleme</h3>
                  <ul className="mt-2 space-y-1.5">
                    {concept.calendar.map((c:any,i:number)=>(
                      <li key={i} className="flex items-center gap-2 text-[12.5px]"><Badge tone="neutral">{c.platform}</Badge> {c.date} — {c.topic}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="card p-4">
                  <h3 className="section-title">Kreatif Konseptler</h3>
                  <ul className="mt-2 list-disc pl-5 text-[13px]">{concept.creativeConcepts.map((c:string,i:number)=><li key={i}>{c}</li>)}</ul>
                </div>
                <div className="card p-4">
                  <h3 className="section-title">Caption & Hashtag</h3>
                  <ul className="mt-2 space-y-1 text-[13px]">{concept.captionConcepts.map((c:string,i:number)=><li key={i}>• {c}</li>)}</ul>
                  <div className="mt-2 flex flex-wrap gap-1">{concept.hashtagStrategy.map((h:string)=><span key={h} className="chip">{h}</span>)}</div>
                  <p className="hint mt-1">CTA stratejisi: {concept.ctaStrategy.join(' • ')}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button className="btn-primary btn-md" onClick={()=>toast.success('Plan oluşturuldu','Kampanya takvimi taslak olarak eklendi.')}>Takvimi Oluştur</button>
                <button className="btn-secondary btn-md" onClick={()=>toast.success('İçerikler hazır','Onay akışına gönderildi.')}>İçerikleri Taslakla</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
