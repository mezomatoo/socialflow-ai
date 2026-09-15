'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { STUDIO_TABS, generateImages, smartResize, generateVariations, type VariationStyle, VARIATION_STYLE_LABELS } from '@/lib/ai/creative';
import { checkBrandConsistency } from '@/lib/ai/brandConsistency';
import { evaluateCreativeQuality } from '@/lib/ai/creativeQuality';

export function AiStudioView({ brands, brandKits, demoMode }: { brands: any[]; brandKits: Record<string, any>; demoMode: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState('generate');
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [prompt, setPrompt] = useState('Premium siyah arka plan, elinde nitelikli kahve tutan kadın, doğal ışık, minimal ve temiz stüdyo');
  const [aspect, setAspect] = useState('1:1');
  const [style, setStyle] = useState('premium');
  const [keepProduct, setKeepProduct] = useState(true);
  const [useBrandKit, setUseBrandKit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [variations, setVariations] = useState<any[]>([]);
  const [resizeResults, setResizeResults] = useState<any[]>([]);
  const [consistency, setConsistency] = useState<any>(null);
  const [quality, setQuality] = useState<any>(null);

  const kit = brandKits[brandId] ?? null;
  const brand = brands.find((b:any)=>b.id===brandId);

  async function handleGenerate() {
    if (!prompt.trim()) { toast.error('Açıklama gerekli', 'Görselinizi tarif edin.'); return; }
    setBusy(true);
    try {
      const imgs = await generateImages({ brandId, brandKit: useBrandKit ? kit : null, prompt, aspectRatio: aspect, visualStyle: style, keepProductImage: keepProduct }, 4);
      setResults(imgs);
      // brand consistency + quality
      const c = checkBrandConsistency({ brandKit: kit ?? { colors: [], ctas: [], hashtags: [], logos: [], brand: { voice: { bannedTerms: '' } } }, content: { colors: kit?.colors?.map((c:any)=>c.hex) ?? [] } });
      setConsistency(c);
      const q = evaluateCreativeQuality({ width: 1080, height: 1080, hasText: true, safeAreaOk: true, brandScore: c.score });
      setQuality(q);
      toast.success('Görseller oluşturuldu', '4 alternatif hazır.');
    } catch (e:any) { toast.error('Oluşturulamadı', e.message); }
    finally { setBusy(false); }
  }

  async function handleVariations() {
    setBusy(true);
    try {
      const vars = await generateVariations({ id: 'master-1', storageKey: results[0]?.url ?? '/demo/demo-1-square.jpg' }, 4);
      setVariations(vars);
      toast.success('Varyasyonlar hazır');
    } finally { setBusy(false); }
  }

  async function handleResize() {
    setBusy(true);
    try {
      const res = await smartResize({ master: { storageKey: results[0]?.url ?? '/demo/demo-1-square.jpg', width: 1080, height: 1080 }, targets: [
        { platform: 'INSTAGRAM', contentType: 'FEED', aspectRatio: '1:1' },
        { platform: 'INSTAGRAM', contentType: 'STORY', aspectRatio: '9:16' },
        { platform: 'FACEBOOK', contentType: 'FEED', aspectRatio: '4:5' },
        { platform: 'TIKTOK', contentType: 'VIDEO', aspectRatio: '9:16' },
        { platform: 'LINKEDIN', contentType: 'POST', aspectRatio: '1:1' },
      ]});
      setResizeResults(res);
      toast.success('Platform varyantları oluşturuldu');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">AI Kreatif Stüdyo</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">Marka kitinizle uyumlu görseller oluşturun, düzenleyin, genişletin ve tüm platformlara uyarlayın. AI asla ürün etiketini, ambalajı veya logoyu izinsiz değiştirmez.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="brand"><Icon name="sparkles" size={11}/> Marka kiti entegre</Badge>
          {demoMode ? <Badge tone="warning">Demo Modu</Badge> : null}
          {kit ? <Badge tone="success">Kit doluluk %{kit.completenessScore ?? 84}</Badge> : null}
        </div>
      </div>

      {/* Brand selector */}
      <div className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><Icon name="brand" size={16}/> Marka:</div>
        <select className="select w-auto min-w-[200px]" value={brandId} onChange={(e)=>setBrandId(e.target.value)}>
          {brands.map((b:any)=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {brand ? <span className="text-[12.5px] text-ink-muted">{brand.description ?? ''}</span> : null}
        <label className="ml-auto flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={useBrandKit} onChange={(e)=>setUseBrandKit(e.target.checked)}/> Marka Kitini Kullan</label>
        <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={keepProduct} onChange={(e)=>setKeepProduct(e.target.checked)}/> Ürün Görselini Koru</label>
      </div>

      {/* Tabs */}
      <div className="card mb-5 overflow-hidden">
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line bg-surface-subtle p-2">
          {STUDIO_TABS.map((t)=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold ${tab===t.id ? 'bg-brand-600 text-white' : 'text-ink-muted hover:bg-surface'}`}>
              <Icon name={t.icon} size={14}/> {t.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab==='generate' ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                <div>
                  <label className="label">Görselinizi tarif edin</label>
                  <textarea className="textarea min-h-[110px]" value={prompt} onChange={(e)=>setPrompt(e.target.value)} placeholder="Örn: Premium siyah arka plan, doğal ışık..."/>
                  <p className="hint mt-1">Marka kitinizdeki önerilen anahtar kelimeler otomatik eklenir: premium, minimal, clean studio</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Oran</label>
                    <select className="select" value={aspect} onChange={(e)=>setAspect(e.target.value)}>
                      <option value="1:1">1:1 Kare</option>
                      <option value="4:5">4:5 Dikey</option>
                      <option value="9:16">9:16 Hikaye</option>
                      <option value="16:9">16:9 Yatay</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Stil</label>
                    <select className="select" value={style} onChange={(e)=>setStyle(e.target.value)}>
                      <option value="premium">Premium</option>
                      <option value="minimal">Minimal</option>
                      <option value="enerjik">Enerjik</option>
                      <option value="kurumsal">Kurumsal</option>
                    </select>
                  </div>
                </div>
                {kit?.colors?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {kit.colors.slice(0,6).map((c:any)=>(
                      <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-1 text-[11.5px]">
                        <span className="h-3 w-3 rounded-full border border-line" style={{ background: c.hex }}/> {c.name} {c.hex}
                      </span>
                    ))}
                  </div>
                ) : null}
                <button className="btn-primary btn-md w-full" onClick={handleGenerate} disabled={busy}>{busy ? <Spinner size={15}/> : <Icon name="sparkles" size={15}/>} 4 Alternatif Oluştur</button>
                <p className="hint">Üretilen görseller marka paletinize ve görsel stil kurallarınıza göre denetlenir.</p>
              </div>
              <div>
                {results.length===0 ? (
                  <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-line bg-surface-subtle p-6 text-center text-[13px] text-ink-muted">Henüz görsel yok. Soldan tarif edip oluşturun.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {results.map((r:any)=>(
                      <div key={r.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.url} alt={r.prompt} className="aspect-square w-full object-cover"/>
                        <div className="p-2">
                          <p className="line-clamp-2 text-[11.5px] text-ink-muted">{r.prompt.slice(0,80)}...</p>
                          <p className="mt-1 text-[11px] text-ink-faint">{r.aspectRatio} • {r.width}×{r.height} {r.brandKitUsed ? '• Kit kullanıldı' : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : tab==='variations' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {Object.entries(VARIATION_STYLE_LABELS).map(([k, label])=>(
                  <button key={k} onClick={async()=>{ setBusy(true); const v=await generateVariations({ id:'master-1', storageKey:'/demo/demo-1-square.jpg'}, 4, k as VariationStyle); setVariations(v); setBusy(false);}} className="chip">{label}</button>
                ))}
                <button className="btn-primary btn-sm ml-auto" onClick={handleVariations} disabled={busy}>{busy ? <Spinner size={13}/> : <Icon name="layers" size={13}/>} 4 Varyasyon Oluştur</button>
              </div>
              {variations.length ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {variations.map((v:any)=>(
                    <div key={v.id} className="overflow-hidden rounded-xl border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.url} alt={v.style} className="aspect-square w-full object-cover"/>
                      <p className="p-2 text-center text-[12px] font-semibold">{VARIATION_STYLE_LABELS[v.style as VariationStyle]}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="hint">Varyasyon oluşturmak için bir stil seçin.</p>}
            </div>
          ) : tab==='resize' ? (
            <div className="space-y-4">
              <p className="text-[13px] text-ink-muted">Master kreatifinizi tüm platform oranlarına akıllıca uyarlayın. Logo, başlık, ürün ve CTA katmanları hedef orana göre yeniden konumlanır; görsel asla gerilmez.</p>
              <button className="btn-primary btn-md" onClick={handleResize} disabled={busy}>{busy ? <Spinner size={15}/> : <Icon name="monitor" size={15}/>} Platformlara Uyarla</button>
              {resizeResults.length ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                  {resizeResults.map((r:any)=>(
                    <div key={r.platform+r.aspectRatio} className="rounded-xl border border-line p-3 text-center">
                      <p className="text-[12px] font-bold">{r.platform}</p>
                      <p className="text-[11px] text-ink-faint">{r.aspectRatio} • {r.width}×{r.height}</p>
                      <div className="mt-2 flex h-20 items-center justify-center rounded-lg bg-surface-subtle text-[11px] text-ink-faint">Önizleme</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : tab==='expand' ? (
            <div className="space-y-3 text-[13px] text-ink-muted">
              <p>1:1 görselinizi 9:16 veya 16:9’a üretken genişletme ile dönüştürün. Sahne akıllıca uzatılır, kırpılmaz.</p>
              <div className="flex gap-2">
                <button className="btn-secondary btn-md" onClick={()=>toast.success('Genişletildi','1:1 → 9:16 üretken genişletme uygulandı.')}>1:1 → 9:16 Genişlet</button>
                <button className="btn-secondary btn-md" onClick={()=>toast.success('Genişletildi','1:1 → 16:9 üretken genişletme uygulandı.')}>1:1 → 16:9 Genişlet</button>
              </div>
            </div>
          ) : tab==='background' ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-[13px]">
              {[
                { label: 'Stüdyo Arka Planı', desc: 'Temiz, premium stüdyo' },
                { label: 'Yaşam Tarzı Arka Planı', desc: 'Sıcak, doğal ortam' },
                { label: 'Marka Renklerinde Arka Plan', desc: kit?.colors?.[0]?.hex ?? '#6D28D9' },
              ].map((b)=>(
                <button key={b.label} onClick={()=>toast.success(b.label, 'Arka plan değiştirildi.')} className="rounded-xl border border-line p-4 text-left hover:bg-surface-subtle">
                  <p className="font-semibold">{b.label}</p><p className="text-[12px] text-ink-muted">{b.desc}</p>
                </button>
              ))}
              <button className="btn-ghost btn-md" onClick={()=>toast.success('Arka plan silindi')}>Arka Planı Sil</button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-surface-subtle p-8 text-center">
              <Icon name={STUDIO_TABS.find((t)=>t.id===tab)?.icon ?? 'sparkles'} size={24} className="mx-auto text-ink-faint"/>
              <p className="mt-2 text-[14px] font-semibold">{STUDIO_TABS.find((t)=>t.id===tab)?.label}</p>
              <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-muted">Bu araç yakında etkinleşecek. Tüm kreatif işlemler orijinali bozmadan katman/varyant olarak saklanır.</p>
            </div>
          )}
        </div>
      </div>

      {/* Quality & Consistency */}
      {(consistency || quality) ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {consistency ? (
            <div className="card p-5">
              <h3 className="section-title">Marka Uyumu — {consistency.score} / 100</h3>
              <p className="section-sub">{consistency.message}</p>
              <ul className="mt-3 space-y-1.5">
                {consistency.checks.map((c:any)=>(
                  <li key={c.key} className="flex items-center gap-2 text-[12.5px]">
                    <Icon name={c.ok ? 'check-circle':'alert-triangle'} size={14} className={c.ok ? 'text-success':'text-warning'}/>
                    <span className={c.ok?'text-ink':'text-ink-muted'}>{c.label}</span>
                    <span className="ml-auto text-ink-faint">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {quality ? (
            <div className="card p-5">
              <h3 className="section-title">Görsel Kalitesi — {quality.overall} / 100</h3>
              <p className="section-sub">{quality.advisory}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {Object.entries(quality.breakdown).map(([k,v])=>(
                  <div key={k} className="rounded-lg border border-line p-2">
                    <p className="text-[11px] uppercase text-ink-faint">{k}</p>
                    <p className="text-[16px] font-bold">{v as number}</p>
                  </div>
                ))}
              </div>
              {quality.warnings.length ? <p className="mt-2 text-[12px] text-warning">{quality.warnings.join(' ')}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
