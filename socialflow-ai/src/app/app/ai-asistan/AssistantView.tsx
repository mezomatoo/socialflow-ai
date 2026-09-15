'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { charLength } from '@/lib/text';
import { CONTENT_STYLE_LABELS, PLATFORM_LIST } from '@/lib/platforms/platforms';

type Task =
  | 'POST_TEXT'
  | 'CAMPAIGN_TEXT'
  | 'PRODUCT_PROMO'
  | 'STORY_TEXT'
  | 'REEL_CAPTION'
  | 'HASHTAGS'
  | 'CTA'
  | 'SHORTEN'
  | 'EXTEND'
  | 'PROFESSIONALIZE'
  | 'SPELLCHECK';

const TASKS: { id: Task; label: string; icon: string; needsText: boolean; needsTopic: boolean; group: string }[] = [
  { id: 'POST_TEXT', label: 'Gönderi Metni', icon: 'text', needsText: false, needsTopic: true, group: 'Oluştur' },
  { id: 'CAMPAIGN_TEXT', label: 'Kampanya Metni', icon: 'zap', needsText: false, needsTopic: true, group: 'Oluştur' },
  { id: 'PRODUCT_PROMO', label: 'Ürün Tanıtımı', icon: 'brand', needsText: false, needsTopic: true, group: 'Oluştur' },
  { id: 'STORY_TEXT', label: 'Hikaye Metni', icon: 'image', needsText: false, needsTopic: true, group: 'Oluştur' },
  { id: 'REEL_CAPTION', label: 'Reels Açıklaması', icon: 'video', needsText: false, needsTopic: true, group: 'Oluştur' },
  { id: 'HASHTAGS', label: 'Hashtag Üret', icon: 'hashtag', needsText: true, needsTopic: false, group: 'Oluştur' },
  { id: 'CTA', label: 'CTA Üret', icon: 'send', needsText: false, needsTopic: true, group: 'Oluştur' },
  { id: 'SHORTEN', label: 'Kısalt', icon: 'collapse', needsText: true, needsTopic: false, group: 'Düzenle' },
  { id: 'EXTEND', label: 'Uzat', icon: 'expand', needsText: true, needsTopic: false, group: 'Düzenle' },
  { id: 'PROFESSIONALIZE', label: 'Profesyonelleştir', icon: 'sparkles', needsText: true, needsTopic: false, group: 'Düzenle' },
  { id: 'SPELLCHECK', label: 'Yazım Kontrolü', icon: 'check-circle', needsText: true, needsTopic: false, group: 'Düzenle' }
];

interface GenResult {
  text: string;
  variants: string[];
  engine: 'LLM' | 'LOCAL';
  warnings: string[];
  missingFields: string[];
}

interface HashtagResult {
  selected: { tag: string; groupLabel: string; reason: string }[];
  block: string;
  note: string;
}

interface SpellResult {
  corrected: string;
  issues: { code: string; message: string; from?: string; to?: string }[];
}

export function AssistantView({
  brands,
  aiProvider,
  demoMode,
  timezone
}: {
  brands: { id: string; name: string; defaultStyle: string }[];
  aiProvider: string;
  demoMode: boolean;
  timezone: string;
}) {
  const toast = useToast();
  const [task, setTask] = useState<Task>('POST_TEXT');
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [style, setStyle] = useState('PROFESSIONAL');
  const [platform, setPlatform] = useState('INSTAGRAM');
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState<GenResult | null>(null);
  const [hashtags, setHashtags] = useState<HashtagResult | null>(null);
  const [spell, setSpell] = useState<SpellResult | null>(null);

  const active = TASKS.find((t) => t.id === task)!;

  function resetOutputs() {
    setGen(null);
    setHashtags(null);
    setSpell(null);
  }

  async function run() {
    resetOutputs();
    setBusy(true);
    try {
      if (task === 'HASHTAGS') {
        const res = await api.post<HashtagResult>('/api/ai/hashtags', {
          text: text || topic,
          brandId: brandId || undefined,
          platform,
          location: location || undefined
        });
        setHashtags(res);
      } else if (task === 'SPELLCHECK') {
        const res = await api.post<SpellResult>('/api/ai/spellcheck', { text });
        setSpell(res);
      } else {
        const res = await api.post<GenResult>('/api/ai/generate', {
          task,
          brandId: brandId || undefined,
          topic: topic || undefined,
          text: text || undefined,
          style,
          platform,
          productName: productName || undefined,
          price: price || undefined,
          discount: discount || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          location: location || undefined
        });
        setGen(res);
      }
    } catch (e) {
      toast.error('İşlem başarısız', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusy(false);
    }
  }

  function copy(value: string) {
    navigator.clipboard?.writeText(value).then(
      () => toast.success('Panoya kopyalandı'),
      () => toast.error('Kopyalanamadı')
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">AI İçerik Asistanı</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          Marka sesinize uygun metinler üretin, mevcut metinleri düzenleyin, hashtag ve yazım denetimi yapın.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={aiProvider === 'deterministic' ? 'warning' : 'success'}>
            <Icon name="sparkles" size={11} />
            {aiProvider === 'deterministic' ? 'Yerel motor (LLM anahtarı tanımlı değil)' : `Sağlayıcı: ${aiProvider}`}
          </Badge>
          {demoMode && (
            <Badge tone="neutral">
              <Icon name="info" size={11} /> Demo Modu
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        {/* Sol: görev seçimi */}
        <div className="card card-pad h-fit">
          <p className="label mb-2">Görev</p>
          <div className="space-y-3">
            {['Oluştur', 'Düzenle'].map((group) => (
              <div key={group}>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">{group}</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {TASKS.filter((t) => t.group === group).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTask(t.id);
                        resetOutputs();
                      }}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors ${
                        task === t.id
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-line text-ink-muted hover:bg-surface-subtle'
                      }`}
                    >
                      <Icon name={t.icon} size={15} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sağ: form + çıktı */}
        <div className="space-y-5">
          <div className="card card-pad">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Marka</label>
                <select className="select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                  <option value="">Markasız</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Platform</label>
                <select className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {PLATFORM_LIST.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {active.needsTopic && (
                <div className="sm:col-span-2">
                  <label className="label">Konu / brief</label>
                  <input
                    className="input"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Örn: Sonbahar koleksiyonu lansmanı, %20 indirim"
                  />
                </div>
              )}

              {active.needsText && (
                <div className="sm:col-span-2">
                  <label className="label">Metin</label>
                  <textarea
                    className="textarea"
                    rows={5}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Düzenlenecek metni buraya yapıştırın…"
                  />
                  <p className="hint mt-1">{charLength(text)} karakter</p>
                </div>
              )}

              <div>
                <label className="label">Anlatım tarzı</label>
                <select className="select" value={style} onChange={(e) => setStyle(e.target.value)}>
                  {Object.entries(CONTENT_STYLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {(task === 'PRODUCT_PROMO' || task === 'CAMPAIGN_TEXT') && (
                <>
                  <div>
                    <label className="label">Ürün adı</label>
                    <input className="input" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Örn: Etiyopya Yirgacheffe" />
                  </div>
                  <div>
                    <label className="label">Fiyat</label>
                    <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Örn: 250 ₺" />
                  </div>
                  <div>
                    <label className="label">İndirim</label>
                    <input className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="Örn: %15" />
                  </div>
                  <div>
                    <label className="label">Konum</label>
                    <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Örn: Kadıköy" />
                  </div>
                  <div>
                    <label className="label">Başlangıç tarihi</label>
                    <input className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Örn: 15 Eylül 2026" />
                  </div>
                  <div>
                    <label className="label">Bitiş tarihi</label>
                    <input className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="Örn: 20 Eylül 2026" />
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button className="btn-primary btn-md" onClick={run} disabled={busy}>
                {busy ? <Spinner size={15} /> : <Icon name="sparkles" size={15} />}
                {busy ? 'Üretiliyor…' : active.label}
              </button>
              <span className="hint">AI yalnızca sizin verdiğiniz bilgileri kullanır; fiyat/tarih/iddia uydurmaz.</span>
            </div>
          </div>

          {/* Çıktı */}
          {busy && (
            <div className="card flex items-center justify-center gap-2 p-10 text-ink-muted">
              <Spinner size={18} /> Çalışıyor…
            </div>
          )}

          {!busy && gen && (
            <div className="card">
              <header className="flex items-center justify-between border-b border-line px-5 py-3">
                <h2 className="section-title">Sonuç</h2>
                <div className="flex items-center gap-2">
                  <Badge tone={gen.engine === 'LLM' ? 'success' : 'neutral'}>{gen.engine === 'LLM' ? 'LLM' : 'Yerel motor'}</Badge>
                  <button className="btn-secondary btn-sm" onClick={() => copy(gen.text)}>
                    <Icon name="copy" size={13} /> Kopyala
                  </button>
                </div>
              </header>
              <div className="p-5">
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{gen.text}</p>
                <p className="hint mt-2">{charLength(gen.text)} karakter</p>

                {gen.missingFields.length > 0 && (
                  <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-ink">
                    <strong>Eksik bilgi:</strong> {gen.missingFields.join(', ')}. AI bu alanları uydurmaz; tamamlarsanız sonuç zenginleşir.
                  </div>
                )}
                {gen.warnings.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {gen.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[12px] text-ink-muted">
                        <Icon name="alert-triangle" size={13} className="mt-0.5 text-warning" /> {w}
                      </li>
                    ))}
                  </ul>
                )}

                {gen.variants.length > 0 && (
                  <div className="mt-5 border-t border-line pt-4">
                    <p className="label mb-2">Alternatifler</p>
                    <div className="space-y-2">
                      {gen.variants.map((v, i) => (
                        <div key={i} className="rounded-lg border border-line bg-surface-subtle p-3">
                          <p className="whitespace-pre-wrap text-[13px] text-ink-muted">{v}</p>
                          <button className="btn-ghost btn-sm mt-2" onClick={() => copy(v)}>
                            <Icon name="copy" size={12} /> Kopyala
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!busy && hashtags && (
            <div className="card">
              <header className="flex items-center justify-between border-b border-line px-5 py-3">
                <h2 className="section-title">Hashtag Önerileri</h2>
                <button className="btn-secondary btn-sm" onClick={() => copy(hashtags.block)}>
                  <Icon name="copy" size={13} /> Bloğu Kopyala
                </button>
              </header>
              <div className="p-5">
                <div className="flex flex-wrap gap-1.5">
                  {hashtags.selected.map((h) => (
                    <button key={h.tag} className="chip chip-active" title={h.reason} onClick={() => copy(`#${h.tag}`)}>
                      #{h.tag}
                    </button>
                  ))}
                </div>
                {hashtags.note && <p className="hint mt-3">{hashtags.note}</p>}
              </div>
            </div>
          )}

          {!busy && spell && (
            <div className="card">
              <header className="flex items-center justify-between border-b border-line px-5 py-3">
                <h2 className="section-title">Yazım Denetimi</h2>
                <button className="btn-secondary btn-sm" onClick={() => copy(spell.corrected)}>
                  <Icon name="copy" size={13} /> Düzeltilmişi Kopyala
                </button>
              </header>
              <div className="p-5">
                {spell.issues.length === 0 ? (
                  <p className="flex items-center gap-2 text-[13px] text-success">
                    <Icon name="check-circle" size={16} /> Yazım hatası bulunmadı.
                  </p>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface-subtle p-3 text-[13.5px] text-ink">
                      {spell.corrected}
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {spell.issues.map((iss, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12.5px] text-ink-muted">
                          <Icon name="info" size={13} className="mt-0.5 text-info" />
                          <span>
                            {iss.message}
                            {iss.from && iss.to && (
                              <>
                                {' '}
                                <span className="text-danger line-through">{iss.from}</span> → <span className="text-success">{iss.to}</span>
                              </>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}

          {!busy && !gen && !hashtags && !spell && (
            <div className="card flex flex-col items-center justify-center gap-2 p-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon name="sparkles" size={22} />
              </span>
              <p className="text-[14px] font-semibold text-ink">Bir görev seçin ve üretmeye başlayın</p>
              <p className="max-w-sm text-[12.5px] text-ink-muted">
                Soldaki görevlerden birini seçin, marka ve konuyu girin. AI; marka sesinize, korunacak terimlerinize ve platform
                kurallarına uygun çıktı üretir.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
