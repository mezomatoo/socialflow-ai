'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api } from '@/lib/client/api';

/**
 * AI Stüdyo görünümü — TÜM üretimler sunucu API'sine gider; tarayıcıda sahte
 * üretim YOKTUR. Sağlayıcı "deterministic" ise sonuçlar dürüstçe "yerel motor"
 * olarak etiketlenir. Harici görsel sağlayıcısı gerektiren araçlar için dürüst
 * "yapılandırılmadı" bilgisi gösterilir (sahte başarı yoktur).
 */

interface StudioResult {
  generationId: string;
  masterId: string;
  mediaAssetId: string;
  url: string | null;
  width: number;
  height: number;
  aspectRatio: string;
  provider: string;
  quality: { overall: number; breakdown: Record<string, number>; warnings: string[] };
  consistency: { score: number; gate: string; message: string };
}

interface MasterItem {
  id: string;
  title: string | null;
  aspectRatio: string | null;
  width: number | null;
  height: number | null;
  fileUrl: string | null;
  brandKitVersion: number | null;
  createdAt: string;
  quality: { overall: number; details: string } | null;
  variants: { id: string; platform: string; contentType: string; aspectRatio: string; fileUrl: string | null; status: string }[];
}

const PLATFORM_TARGETS = [
  { platform: 'INSTAGRAM', contentType: 'FEED', aspectRatio: '1:1', label: 'Instagram Gönderi (1:1)' },
  { platform: 'INSTAGRAM', contentType: 'FEED', aspectRatio: '4:5', label: 'Instagram Dikey (4:5)' },
  { platform: 'INSTAGRAM', contentType: 'STORY', aspectRatio: '9:16', label: 'Instagram Hikaye (9:16)' },
  { platform: 'FACEBOOK', contentType: 'FEED', aspectRatio: '4:5', label: 'Facebook (4:5)' },
  { platform: 'LINKEDIN', contentType: 'POST', aspectRatio: '1:1', label: 'LinkedIn (1:1)' },
  { platform: 'TIKTOK', contentType: 'VIDEO', aspectRatio: '9:16', label: 'TikTok (9:16)' },
  { platform: 'X', contentType: 'POST', aspectRatio: '16:9', label: 'X (16:9)' }
];

const QUALITY_LABELS: Record<string, string> = {
  resolution: 'Çözünürlük',
  readability: 'Okunabilirlik',
  contrast: 'Kontrast',
  composition: 'Kompozisyon',
  brandConsistency: 'Marka Uyumu',
  platformFit: 'Platform Uyumu'
};

const TABS = [
  { id: 'generate', label: 'Görsel Oluştur', icon: 'sparkles' },
  { id: 'resize', label: 'Platformlara Uyarla', icon: 'monitor' },
  { id: 'variations', label: 'Varyasyon', icon: 'layers' },
  { id: 'expand', label: 'Görseli Genişlet', icon: 'maximize' },
  { id: 'video', label: 'Video Dönüştür', icon: 'video' }
];

export function AiStudioView({
  brands,
  aiMode,
}: {
  brands: { id: string; name: string; description: string | null }[];
  aiMode: string;
}) {
  const toast = useToast();
  const [tab, setTab] = useState('generate');
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [prompt, setPrompt] = useState('');
  const [headline, setHeadline] = useState('');
  const [cta, setCta] = useState('');
  const [aspect, setAspect] = useState('1:1');
  const [count, setCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<StudioResult[]>([]);
  const [masters, setMasters] = useState<MasterItem[]>([]);
  const [selectedMaster, setSelectedMaster] = useState<string>('');
  const [resizeTargets, setResizeTargets] = useState<string[]>([PLATFORM_TARGETS[0].label]);
  const [variants, setVariants] = useState<MasterItem['variants']>([]);
  const [kitColors, setKitColors] = useState<{ name: string; hex: string }[]>([]);

  const loadMasters = useCallback(async () => {
    try {
      const data = await api.get<{ items: MasterItem[] }>('/api/v1/ai/studio/masters');
      setMasters(data.items);
      if (data.items[0]) setSelectedMaster((cur) => cur || data.items[0].id);
    } catch {
      /* sessiz — liste boş görünür */
    }
  }, []);

  useEffect(() => {
    loadMasters();
  }, [loadMasters]);

  useEffect(() => {
    if (!brandId) return;
    api
      .get<{ kit: { colors: { name: string; hex: string }[] } }>(`/api/v1/brands/${brandId}/marka-kiti`)
      .then((d) => setKitColors(d.kit?.colors ?? []))
      .catch(() => setKitColors([]));
  }, [brandId]);

  async function handleGenerate() {
    if (!brandId) {
      toast.error('Marka seçin', 'Kreatif üretimi bir marka kitine bağlıdır.');
      return;
    }
    if (prompt.trim().length < 3) {
      toast.error('Açıklama gerekli', 'Görselinizi en az 3 karakterle tarif edin.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post<{ items: StudioResult[]; provider: string }>('/api/v1/ai/studio/generate', {
        brandId,
        prompt,
        headline: headline || undefined,
        cta: cta || undefined,
        aspectRatio: aspect,
        count
      });
      setResults(data.items);
      await loadMasters();
      toast.success(
        'Kreatifler oluşturuldu',
        data.provider === 'deterministic'
          ? 'Yerel motorla üretildi; sonuçlar medya kütüphanesine kaydedildi.'
          : 'Sonuçlar medya kütüphanesine kaydedildi.'
      );
    } catch (e) {
      toast.error('Oluşturulamadı', e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResize() {
    const masterId = selectedMaster || results[0]?.masterId;
    if (!masterId) {
      toast.error('Kreatif seçin', 'Önce bir kreatif oluşturun veya geçmişten seçin.');
      return;
    }
    const targets = PLATFORM_TARGETS.filter((t) => resizeTargets.includes(t.label));
    if (!targets.length) {
      toast.error('Hedef seçin', 'En az bir platform oranı seçin.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post<{ items: MasterItem['variants'] }>(`/api/v1/ai/studio/${masterId}/resize`, { targets });
      setVariants(data.items);
      await loadMasters();
      toast.success('Platform varyantları oluşturuldu', `${data.items.length} hedef için yeniden bileştirildi.`);
    } catch (e) {
      toast.error('Uyarlanamadı', e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVariations(styles: string[]) {
    const masterId = selectedMaster || results[0]?.masterId;
    if (!masterId) {
      toast.error('Kreatif seçin', 'Önce bir kreatif oluşturun veya geçmişten seçin.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/v1/ai/studio/${masterId}/variations`, { styles });
      await loadMasters();
      toast.success('Varyasyonlar oluşturuldu');
    } catch (e) {
      toast.error('Varyasyon oluşturulamadı', e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusy(false);
    }
  }

  async function sendFeedback(generationId: string, rating: 'LIKED' | 'DISLIKED') {
    try {
      await api.post('/api/v1/ai/feedback', { service: 'imageGeneration', outputId: generationId, rating });
      toast.success(rating === 'LIKED' ? 'Geri bildiriminiz kaydedildi: Beğendim' : 'Geri bildiriminiz kaydedildi: Beğenmedim');
    } catch {
      toast.error('Geri bildirim kaydedilemedi');
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">AI Stüdyo</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
          Marka kitinizle uyumlu kreatifler oluşturun, platformlara uyarlayın ve varyasyonlar üretin. Tüm çıktılar
          medya kütüphanesine yeni kayıt olarak eklenir; orijinaller asla değiştirilmez.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="brand"><Icon name="sparkles" size={11} /> Marka kiti entegre</Badge>
          <Badge tone="neutral">Sağlayıcı: {aiMode || 'yerel motor'}</Badge>
        </div>
      </div>

      {/* Marka seçimi */}
      <div className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><Icon name="brand" size={16} /> Marka:</div>
        <select className="select w-auto min-w-[200px]" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {kitColors.length ? (
          <div className="flex flex-wrap gap-1.5">
            {kitColors.slice(0, 6).map((c, i) => (
              <span key={`${c.hex}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-1 text-[11.5px]">
                <span className="h-3 w-3 rounded-full border border-line" style={{ background: c.hex }} /> {c.name}
              </span>
            ))}
          </div>
        ) : null}
        {masters.length ? (
          <select className="select ml-auto w-auto min-w-[180px]" value={selectedMaster} onChange={(e) => setSelectedMaster(e.target.value)} aria-label="Kreatif geçmişi">
            <option value="">Kreatif seç…</option>
            {masters.map((m) => (
              <option key={m.id} value={m.id}>{(m.title ?? 'Kreatif').slice(0, 48)}</option>
            ))}
          </select>
        ) : null}
      </div>

      {/* Sekmeler */}
      <div className="card mb-5 overflow-hidden">
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line bg-surface-subtle p-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold ${tab === t.id ? 'bg-brand-600 text-white' : 'text-ink-muted hover:bg-surface'}`}>
              <Icon name={t.icon} size={14} /> {t.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'generate' ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                <div>
                  <label className="label">Kreatif fikrinizi tarif edin</label>
                  <textarea className="textarea min-h-[110px]" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Örn: Yeni sezon kahve kampanyası, sıcak tonlar, ürün odaklı kompozisyon" />
                  <p className="hint mt-1">Marka kitinizdeki onaylı renkler ve görsel kural anahtar kelimeleri otomatik uygulanır.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Başlık (opsiyonel)</label>
                    <input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Kreatif üzerindeki büyük metin" maxLength={120} />
                  </div>
                  <div>
                    <label className="label">CTA (opsiyonel)</label>
                    <input className="input" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Şimdi İncele" maxLength={60} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Oran</label>
                    <select className="select" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                      <option value="1:1">1:1 Kare</option>
                      <option value="4:5">4:5 Dikey</option>
                      <option value="9:16">9:16 Hikaye</option>
                      <option value="16:9">16:9 Yatay</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Adet</label>
                    <select className="select" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} alternatif</option>)}
                    </select>
                  </div>
                </div>
                <button className="btn-primary btn-md w-full" onClick={handleGenerate} disabled={busy}>
                  {busy ? <Spinner size={15} /> : <Icon name="sparkles" size={15} />} Kreatif Oluştur
                </button>
                <p className="hint">Üretilen her kreatif; marka tutarlılığı ve kalite kontrolünden geçer, medya kütüphanesine kaydedilir.</p>
              </div>
              <div>
                {results.length === 0 ? (
                  <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-line bg-surface-subtle p-6 text-center text-[13px] text-ink-muted">
                    Henüz kreatif yok. Soldan tarif edip oluşturun.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {results.map((r) => (
                      <div key={r.masterId} className="overflow-hidden rounded-xl border border-line bg-surface">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.url ?? ''} alt={r.masterId} className="aspect-square w-full object-contain" />
                        <div className="p-2">
                          <p className="text-[11px] text-ink-faint">{r.aspectRatio} • {r.width}×{r.height} • {r.provider === 'deterministic' ? 'yerel motor' : r.provider}</p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <button className="btn-ghost btn-xs" onClick={() => sendFeedback(r.generationId, 'LIKED')} aria-label="Beğendim"><Icon name="check-circle" size={13} /></button>
                            <button className="btn-ghost btn-xs" onClick={() => sendFeedback(r.generationId, 'DISLIKED')} aria-label="Beğenmedim"><Icon name="x" size={13} /></button>
                            <span className="ml-auto text-[11px] font-bold text-ink-faint">Kalite {r.quality.overall}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : tab === 'resize' ? (
            <div className="space-y-4">
              <p className="text-[13px] text-ink-muted">
                Seçili master kreatif; logo, başlık ve CTA katmanları hedef orana göre yeniden konumlanarak uyarlanır.
                Görsel asla esnetilmez; sonuçlar CreativeVariant olarak kaydedilir.
              </p>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_TARGETS.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => setResizeTargets((cur) => (cur.includes(t.label) ? cur.filter((x) => x !== t.label) : [...cur, t.label]))}
                    className={`chip ${resizeTargets.includes(t.label) ? 'chip-active' : ''}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button className="btn-primary btn-md" onClick={handleResize} disabled={busy}>
                {busy ? <Spinner size={15} /> : <Icon name="monitor" size={15} />} Platformlara Uyarla
              </button>
              {variants.length ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                  {variants.map((v) => (
                    <div key={v.id} className="rounded-xl border border-line p-3 text-center">
                      <p className="text-[12px] font-bold">{v.platform}</p>
                      <p className="text-[11px] text-ink-faint">{v.aspectRatio}</p>
                      {v.fileUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={v.fileUrl} alt={v.platform} className="mt-2 h-24 w-full rounded-lg object-contain" />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : tab === 'variations' ? (
            <div className="space-y-4">
              <p className="text-[13px] text-ink-muted">Seçili kreatif için kontrollü varyasyonlar üretin: düzen, başlık vurgusu ve kompozisyon değişir; marka paleti korunur.</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'MINIMAL', label: 'Minimal' },
                  { id: 'PREMIUM', label: 'Premium' },
                  { id: 'SALES', label: 'Satış Odaklı' },
                  { id: 'PRODUCT_FOCUSED', label: 'Ürün Odaklı' }
                ].map((s) => (
                  <button key={s.id} className="chip" onClick={() => handleVariations([s.id])} disabled={busy}>{s.label}</button>
                ))}
                <button className="btn-primary btn-sm ml-auto" onClick={() => handleVariations(['MINIMAL', 'PREMIUM', 'SALES', 'PRODUCT_FOCUSED'])} disabled={busy}>
                  {busy ? <Spinner size={13} /> : <Icon name="layers" size={13} />} 4 Varyasyon Oluştur
                </button>
              </div>
            </div>
          ) : tab === 'expand' ? (
            <div className="space-y-3 text-[13px] text-ink-muted">
              <p>Kreatifi seçili orandan hedef orana yeniden bileştirerek genişletin (sahne uzatılır, kırpılmaz ve esnetilmez).</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary btn-md" onClick={() => { setTab('resize'); setResizeTargets(['Instagram Hikaye (9:16)']); }}>1:1 → 9:16 Genişlet</button>
                <button className="btn-secondary btn-md" onClick={() => { setTab('resize'); setResizeTargets(['X (16:9)']); }}>1:1 → 16:9 Genişlet</button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-surface-subtle p-8 text-center">
              <Icon name="video" size={24} className="mx-auto text-ink-faint" />
              <p className="mt-2 text-[14px] font-semibold">Video Dönüştür</p>
              <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-muted">
                Video analizi ve kısa klip önerileri için transkripsiyon yeteneği olan harici bir AI sağlayıcısı
                gerekir. Bu kurulumda yapılandırılmadı; yapılandırıldığında bu araç etkinleşir.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Sonuç değerlendirmeleri */}
      {results.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="card p-5">
            <h3 className="section-title">Marka Uyumu</h3>
            <p className="section-sub">{results[0].consistency.message}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div className="h-full bg-brand-600" style={{ width: `${results[0].consistency.score}%` }} />
            </div>
            <p className="mt-2 text-[12px] text-ink-faint">Skor: {results[0].consistency.score}/100 · Kapı: {results[0].consistency.gate}</p>
          </div>
          <div className="card p-5">
            <h3 className="section-title">Kreatif Kalitesi — {results[0].quality.overall} / 100</h3>
            <p className="section-sub">Skorlar tavsiye niteliğindedir; nihai karar kullanıcıya aittir.</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {Object.entries(results[0].quality.breakdown).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line p-2">
                  <p className="text-[11px] uppercase text-ink-faint">{QUALITY_LABELS[k] ?? k}</p>
                  <p className="text-[16px] font-bold">{v}</p>
                </div>
              ))}
            </div>
            {results[0].quality.warnings.length ? <p className="mt-2 text-[12px] text-warning">{results[0].quality.warnings.join(' ')}</p> : null}
          </div>
        </div>
      ) : null}

      {/* Geçmiş */}
      {masters.length > 0 ? (
        <div className="card mt-5">
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="section-title">Stüdyo Geçmişi</h2>
            <span className="hint">{masters.length} kreatif</span>
          </header>
          <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4 lg:grid-cols-6">
            {masters.slice(0, 12).map((m) => (
              <button key={m.id} onClick={() => { setSelectedMaster(m.id); setTab('resize'); }} className={`overflow-hidden rounded-xl border text-left ${selectedMaster === m.id ? 'border-brand-500' : 'border-line'}`}>
                {m.fileUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={m.fileUrl} alt={m.title ?? ''} className="h-24 w-full object-contain" />
                ) : null}
                <p className="line-clamp-2 p-2 text-[11px] text-ink-muted">{m.title}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
