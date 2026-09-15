'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api } from '@/lib/client/api';

/**
 * AI Kampanya Oluşturucu — mevcut Campaign sistemini genişletir (§86).
 * Ürün/teklif/kupon modülü YOKTUR: fiyat gibi gerçek bilgiler yalnızca
 * kullanıcının kendi girdiği metinden taşınır, AI uydurmaz (§78/§87).
 */

interface CampaignConcept {
  theme: string;
  name: string;
  keyMessage: string;
  pillars: string[];
  platformStrategy: Record<string, string>;
  calendar: { date: string; platform: string; topic: string }[];
  creativeConcepts: string[];
  captionConcepts: string[];
  ctaStrategy: string[];
  hashtagStrategy: string[];
  engine: 'ai' | 'deterministic';
}

const PLATFORM_OPTIONS = ['INSTAGRAM', 'FACEBOOK', 'X', 'LINKEDIN', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'THREADS'];

export function AiCampaignView({
  brands,
}: {
  brands: { id: string; name: string }[];
}) {
  const toast = useToast();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10));
  const [userFacts, setUserFacts] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['INSTAGRAM', 'LINKEDIN']);
  const [busy, setBusy] = useState(false);
  const [concept, setConcept] = useState<CampaignConcept | null>(null);
  const [created, setCreated] = useState<{ campaignId: string; code: string; name: string } | null>(null);

  async function handleGenerate() {
    if (!brandId || goal.trim().length < 2) {
      toast.error('Eksik bilgi', 'Marka ve kampanya hedefi gereklidir.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<CampaignConcept>('/api/v1/ai/campaign/generate', {
        brandId,
        goal,
        name: name || undefined,
        startDate: start,
        endDate: end,
        platforms,
        userFacts: userFacts || undefined
      });
      setConcept(res);
      setCreated(null);
      toast.success('Kampanya konsepti hazır', res.engine === 'ai' ? 'AI ile üretildi.' : 'Yerel motorla üretildi.');
    } catch (e) {
      toast.error('Oluşturulamadı', e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!concept) return;
    setBusy(true);
    try {
      const res = await api.post<{ campaignId: string; code: string; name: string; concept: CampaignConcept }>('/api/v1/ai/campaign/create', {
        brandId,
        goal,
        name: name || concept.name,
        startDate: start,
        endDate: end,
        platforms,
        userFacts: userFacts || undefined
      });
      setCreated(res);
      toast.success('Kampanya oluşturuldu', `${res.name} (${res.code}) kampanyalarınız arasında kaydedildi.`);
    } catch (e) {
      toast.error('Kampanya kaydedilemedi', e instanceof Error ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusy(false);
    }
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">AI Kampanya Oluşturucu</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
          Tema, mesaj ve platform stratejisi önerir; sonucu mevcut kampanya sisteminize kaydeder. Fiyat, indirim veya
          kampanya koşulu gibi bilgileri AI UYDURMAZ — yalnızca sizin girdiğiniz gerçek bilgiler önerilere taşınır.
        </p>
        <div className="mt-2 flex gap-2">
          {concept ? <Badge tone={concept.engine === 'ai' ? 'brand' : 'neutral'}>{concept.engine === 'ai' ? 'AI ile üretildi' : 'Yerel motorla üretildi'}</Badge> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <div className="card h-fit space-y-4 p-5">
          <div>
            <label className="label">Marka</label>
            <select className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Kampanya adı</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn: Yeni Sezon Lansmanı" />
          </div>
          <div>
            <label className="label">Kampanya hedefi</label>
            <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Örn: Lansman, satış, farkındalık" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Başlangıç</label><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><label className="label">Bitiş</label><input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div>
            <label className="label">Platformlar</label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORM_OPTIONS.map((p) => (
                <button key={p} onClick={() => togglePlatform(p)} className={`chip ${platforms.includes(p) ? 'chip-active' : ''}`}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Gerçek kampanya bilgileri (opsiyonel)</label>
            <textarea className="textarea min-h-[70px]" value={userFacts} onChange={(e) => setUserFacts(e.target.value)} placeholder="Örn: %20 indirim, 20.09.2026'ya kadar geçerli" />
            <p className="hint mt-1">Buraya yazdığınız bilgiler aynen korunur; AI fiyat/tarih eklemez.</p>
          </div>
          <button className="btn-primary btn-md w-full" onClick={handleGenerate} disabled={busy || platforms.length === 0}>
            {busy ? <Spinner size={15} /> : <Icon name="target" size={15} />} Konsept Oluştur
          </button>
          <p className="hint">AI yalnızca öneri üretir. Kampanya kaydı, mevcut kampanya sisteminize eklenir.</p>
        </div>

        <div className="space-y-4">
          {!concept ? (
            <div className="card flex flex-col items-center justify-center p-10 text-center">
              <Icon name="target" size={28} className="text-ink-faint" />
              <p className="mt-2 font-semibold">Henüz kampanya konsepti yok</p>
              <p className="text-[13px] text-ink-muted">Soldan bilgileri doldurup konsept oluşturun. Marka kitinizdeki slogan, CTA ve hashtagler kullanılır.</p>
            </div>
          ) : (
            <>
              <div className="card p-5">
                <h2 className="text-[18px] font-bold">{concept.name}</h2>
                <p className="text-[13px] text-ink-muted">{concept.theme}</p>
                <div className="mt-3 rounded-lg border border-line bg-surface-subtle p-3">
                  <p className="text-[12px] font-semibold">Ana Mesaj</p>
                  <p className="text-[13.5px]">{concept.keyMessage}</p>
                </div>
                <div className="mt-3">
                  <p className="label">İçerik Sütunları</p>
                  <div className="flex flex-wrap gap-1.5">{concept.pillars.map((p) => <span key={p} className="chip chip-active">{p}</span>)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="card p-4">
                  <h3 className="section-title">Platform Stratejisi</h3>
                  <ul className="mt-2 space-y-1.5">
                    {Object.entries(concept.platformStrategy).map(([k, v]) => (
                      <li key={k} className="text-[13px]"><strong>{k}:</strong> {v}</li>
                    ))}
                  </ul>
                </div>
                <div className="card p-4">
                  <h3 className="section-title">Yayın Yapısı</h3>
                  <ul className="mt-2 space-y-1.5">
                    {concept.calendar.map((c, i) => (
                      <li key={i} className="flex items-center gap-2 text-[12.5px]"><Badge tone="neutral">{c.platform}</Badge> {c.date} — {c.topic}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="card p-4">
                  <h3 className="section-title">Kreatif Konseptler</h3>
                  <ul className="mt-2 list-disc pl-5 text-[13px]">{concept.creativeConcepts.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
                <div className="card p-4">
                  <h3 className="section-title">Mesaj & Hashtag Fikirleri</h3>
                  <ul className="mt-2 space-y-1 text-[13px]">{concept.captionConcepts.map((c, i) => <li key={i}>• {c}</li>)}</ul>
                  <div className="mt-2 flex flex-wrap gap-1">{concept.hashtagStrategy.map((h) => <span key={h} className="chip">{h}</span>)}</div>
                  <p className="hint mt-1">CTA stratejisi: {concept.ctaStrategy.join(' • ')}</p>
                </div>
              </div>

              {created ? (
                <div className="card border-success/30 bg-success/5 p-4">
                  <p className="text-[13.5px] font-bold text-success">Kampanya kaydedildi: {created.name} ({created.code})</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a className="btn-secondary btn-sm" href={`/app/takvim?campaign=${created.campaignId}`}>Takvimde gör</a>
                    <a className="btn-ghost btn-sm" href="/app/ai-planlayici">AI Planlayıcı ile plan üret</a>
                  </div>
                </div>
              ) : (
                <button className="btn-primary btn-md" onClick={handleCreate} disabled={busy}>
                  {busy ? <Spinner size={14} /> : <Icon name="check-circle" size={15} />} Kampanyayı Sisteme Kaydet
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
