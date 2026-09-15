'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Badge, EmptyState, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { CONTENT_STYLE_LABELS } from '@/lib/platforms/platforms';

interface Voice {
  tone: string;
  personality: string | null;
  audience: string | null;
  allowedTerms: string[];
  bannedTerms: string[];
  mustKeepTerms: string[];
  formality: string;
  emojiLevel: string;
}

interface BrandItem {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  fontStyle: string;
  website: string | null;
  defaultCta: string | null;
  description: string | null;
  targetAudience: string | null;
  defaultStyle: string;
  defaultHashtags: string[];
  requiredHashtags: string[];
  bannedHashtags: string[];
  defaultMentions: string[];
  isDefault: boolean;
  accounts: number;
  contents: number;
  voice: Voice | null;
}

const FORMALITY: Record<string, string> = { FORMAL: 'Resmî', NEUTRAL: 'Nötr', CASUAL: 'Samimi' };
const EMOJI: Record<string, string> = { NONE: 'Yok', LOW: 'Az', MEDIUM: 'Orta', HIGH: 'Çok' };

export function BrandsView({ items: initial }: { items: BrandItem[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<BrandItem | 'new' | null>(null);

  async function setDefault(b: BrandItem) {
    try {
      await api.patch(`/api/brands/${b.id}`, { isDefault: true });
      setItems((prev) => prev.map((x) => ({ ...x, isDefault: x.id === b.id })));
      toast.success('Varsayılan marka güncellendi', `${b.name} artık varsayılan.`);
    } catch (e) {
      toast.error('Güncellenemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    }
  }

  async function remove(b: BrandItem) {
    if (!window.confirm(`"${b.name}" markası silinsin mi? İlişkili içerikler etkilenebilir.`)) return;
    try {
      await api.del(`/api/brands/${b.id}`);
      setItems((prev) => prev.filter((x) => x.id !== b.id));
      toast.success('Marka silindi');
    } catch (e) {
      toast.error('Silinemedi', e instanceof ApiError ? e.message : 'Bu marka kullanımda olabilir.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Marka Profilleri</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Her markanın sesi, renkleri, varsayılan etiketleri ve korunacak terimleri. AI uyarlamaları bu profillere göre yapılır.
          </p>
        </div>
        <button className="btn-primary btn-md" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Yeni Marka
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card p-6">
          <EmptyState
            icon="brand"
            title="Marka profili yok"
            description="İçerik üretmeye başlamak için önce bir marka profili oluşturun."
            action={
              <button className="btn-primary btn-md" onClick={() => setEditing('new')}>
                <Icon name="plus" size={15} /> Yeni Marka
              </button>
            }
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((b) => (
            <li key={b.id} className="card card-hover overflow-hidden">
              <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${b.primaryColor}, ${b.secondaryColor})` }} />
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line"
                    style={{ background: `color-mix(in srgb, ${b.primaryColor} 12%, white)` }}
                  >
                    {b.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.logoUrl} alt={b.name} className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-[16px] font-extrabold" style={{ color: b.primaryColor }}>
                        {b.name.charAt(0)}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[15px] font-bold text-ink">{b.name}</h3>
                      {b.isDefault && <Badge tone="brand">Varsayılan</Badge>}
                    </div>
                    <p className="truncate text-[12px] text-ink-faint">/{b.slug}</p>
                    {b.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-muted">{b.description}</p>}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-faint">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="layers" size={12} /> {b.contents} içerik
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="users" size={12} /> {b.accounts} hesap
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="sparkles" size={12} /> {CONTENT_STYLE_LABELS[b.defaultStyle as keyof typeof CONTENT_STYLE_LABELS] ?? b.defaultStyle}
                  </span>
                  {b.voice && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="text" size={12} /> {FORMALITY[b.voice.formality] ?? b.voice.formality} · {EMOJI[b.voice.emojiLevel] ?? b.voice.emojiLevel} emoji
                    </span>
                  )}
                </div>

                {b.requiredHashtags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {b.requiredHashtags.slice(0, 4).map((h) => (
                      <Badge key={h} tone="neutral">
                        #{h.replace(/^#/, '')}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  {!b.isDefault && (
                    <button className="btn-ghost btn-sm" onClick={() => setDefault(b)}>
                      <Icon name="check" size={13} /> Varsayılan yap
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <Link href={`/app/markalar/${b.id}`} className="btn-secondary btn-sm">
                      <Icon name="eye" size={13} /> Marka Sesi
                    </Link>
                    <button className="btn-secondary btn-sm" onClick={() => setEditing(b)}>
                      <Icon name="edit" size={13} /> Düzenle
                    </button>
                    <button className="btn-ghost btn-sm" title="Sil" onClick={() => remove(b)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}


      {editing && (
        <BrandEditor
          brand={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(b) => {
            setItems((prev) => {
              const exists = prev.some((x) => x.id === b.id);
              const next = exists ? prev.map((x) => (x.id === b.id ? b : x)) : [...prev, b];
              return b.isDefault ? next.map((x) => ({ ...x, isDefault: x.id === b.id })) : next;
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function emptyBrand(): BrandItem {
  return {
    id: '',
    name: '',
    slug: '',
    logoUrl: null,
    primaryColor: '#6D28D9',
    secondaryColor: '#0EA5E9',
    fontStyle: 'Inter',
    website: null,
    defaultCta: null,
    description: null,
    targetAudience: null,
    defaultStyle: 'PROFESSIONAL',
    defaultHashtags: [],
    requiredHashtags: [],
    bannedHashtags: [],
    defaultMentions: [],
    isDefault: false,
    accounts: 0,
    contents: 0,
    voice: { tone: 'profesyonel ve samimi', personality: null, audience: null, allowedTerms: [], bannedTerms: [], mustKeepTerms: [], formality: 'NEUTRAL', emojiLevel: 'MEDIUM' }
  };
}

function BrandEditor({ brand, onClose, onSaved }: { brand: BrandItem | null; onClose: () => void; onSaved: (b: BrandItem) => void }) {
  const toast = useToast();
  const isNew = !brand;
  const [form, setForm] = useState<BrandItem>(brand ?? emptyBrand());
  const [saving, setSaving] = useState(false);

  function set<K extends keyof BrandItem>(key: K, value: BrandItem[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setVoice<K extends keyof Voice>(key: K, value: Voice[K]) {
    setForm((f) => ({ ...f, voice: { ...(f.voice ?? emptyBrand().voice!), [key]: value } }));
  }

  async function submit() {
    if (!form.name.trim()) {
      toast.error('Marka adı gerekli', 'Lütfen bir marka adı girin.');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      logoUrl: form.logoUrl,
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
      fontStyle: form.fontStyle,
      website: form.website,
      defaultCta: form.defaultCta,
      description: form.description,
      targetAudience: form.targetAudience,
      defaultStyle: form.defaultStyle,
      defaultHashtags: form.defaultHashtags.join(', '),
      requiredHashtags: form.requiredHashtags.join(', '),
      bannedHashtags: form.bannedHashtags.join(', '),
      defaultMentions: form.defaultMentions.join(', '),
      isDefault: form.isDefault || undefined,
      voice: form.voice
    };
    try {
      const saved = isNew
        ? await api.post<BrandItem>('/api/brands', payload)
        : await api.patch<BrandItem>(`/api/brands/${form.id}`, payload);
      onSaved({ ...form, ...saved, id: saved.id ?? form.id } as BrandItem);
      toast.success(isNew ? 'Marka oluşturuldu' : 'Marka güncellendi');
    } catch (e) {
      toast.error('Kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Yeni Marka Profili' : `Markayı Düzenle — ${brand?.name}`}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary btn-md" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-primary btn-md" onClick={submit} disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Kimlik */}
        <section>
          <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Marka Kimliği</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Marka adı *</label>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Örnek Marka" />
            </div>
            <div>
              <label className="label">Logo URL</label>
              <input className="input" value={form.logoUrl ?? ''} onChange={(e) => set('logoUrl', e.target.value || null)} placeholder="https://ornek.com/logo.svg" />
            </div>
            <div>
              <label className="label">Ana renk</label>
              <div className="flex items-center gap-2">
                <input type="color" className="h-9 w-12 cursor-pointer rounded border border-line" value={form.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} />
                <input className="input" value={form.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">İkincil renk</label>
              <div className="flex items-center gap-2">
                <input type="color" className="h-9 w-12 cursor-pointer rounded border border-line" value={form.secondaryColor} onChange={(e) => set('secondaryColor', e.target.value)} />
                <input className="input" value={form.secondaryColor} onChange={(e) => set('secondaryColor', e.target.value)} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Açıklama</label>
              <textarea className="textarea" rows={2} value={form.description ?? ''} onChange={(e) => set('description', e.target.value || null)} placeholder="Marka ne yapar, ne satar?" />
            </div>
            <div>
              <label className="label">Web sitesi</label>
              <input className="input" value={form.website ?? ''} onChange={(e) => set('website', e.target.value || null)} placeholder="https://" />
            </div>
            <div>
              <label className="label">Hedef kitle</label>
              <input className="input" value={form.targetAudience ?? ''} onChange={(e) => set('targetAudience', e.target.value || null)} placeholder="25-40 yaş, kahve severler" />
            </div>
          </div>
        </section>

        {/* İçerik varsayılanları */}
        <section>
          <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-faint">İçerik Varsayılanları</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Varsayılan anlatım tarzı</label>
              <select className="select" value={form.defaultStyle} onChange={(e) => set('defaultStyle', e.target.value)}>
                {Object.entries(CONTENT_STYLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Varsayılan CTA</label>
              <input className="input" value={form.defaultCta ?? ''} onChange={(e) => set('defaultCta', e.target.value || null)} placeholder="Detaylar bağlantıda." />
            </div>
            <TagField label="Varsayılan hashtagler" hint="Her içeriğe önerilen etiketler" values={form.defaultHashtags} onChange={(v) => set('defaultHashtags', v)} />
            <TagField label="Zorunlu hashtagler" hint="AI asla çıkarmaz" values={form.requiredHashtags} onChange={(v) => set('requiredHashtags', v)} />
            <TagField label="Yasaklı hashtagler" hint="Bu etiketler elenir" values={form.bannedHashtags} onChange={(v) => set('bannedHashtags', v)} />
            <TagField label="Varsayılan mentionlar" hint="@hesap adı" values={form.defaultMentions} onChange={(v) => set('defaultMentions', v)} />
          </div>
        </section>

        {/* Marka sesi */}
        <section>
          <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Marka Sesi (AI uyarlamalarında kullanılır)</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Ton</label>
              <input className="input" value={form.voice?.tone ?? ''} onChange={(e) => setVoice('tone', e.target.value)} placeholder="profesyonel ve samimi" />
            </div>
            <div>
              <label className="label">Kişilik</label>
              <input className="input" value={form.voice?.personality ?? ''} onChange={(e) => setVoice('personality', e.target.value || null)} placeholder="güvenilir, sıcak" />
            </div>
            <div>
              <label className="label">Resmiyet</label>
              <select className="select" value={form.voice?.formality ?? 'NEUTRAL'} onChange={(e) => setVoice('formality', e.target.value)}>
                {Object.entries(FORMALITY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Emoji yoğunluğu</label>
              <select className="select" value={form.voice?.emojiLevel ?? 'MEDIUM'} onChange={(e) => setVoice('emojiLevel', e.target.value)}>
                {Object.entries(EMOJI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <TagField label="Korunacak terimler" hint="Fiyat, ürün adı, tarih — AI asla değiştirmez/çıkarmaz" values={form.voice?.mustKeepTerms ?? []} onChange={(v) => setVoice('mustKeepTerms', v)} />
            <TagField label="Yasaklı terimler" hint="Metinden çıkarılır" values={form.voice?.bannedTerms ?? []} onChange={(v) => setVoice('bannedTerms', v)} />
          </div>
        </section>

        <label className="flex items-center gap-2 border-t border-line pt-4 text-[13px] font-medium text-ink">
          <input type="checkbox" className="h-4 w-4" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />
          Bu marka varsayılan olsun
        </label>
      </div>
    </Modal>
  );
}

function TagField({
  label,
  hint,
  values,
  onChange
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  function add() {
    const parts = draft
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const merged = Array.from(new Set([...values, ...parts]));
    onChange(merged);
    setDraft('');
  }
  return (
    <div>
      <label className="label">{label}</label>
      {values.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="chip chip-active">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="ml-1 opacity-70 hover:opacity-100">
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="input"
          value={draft}
          placeholder={hint ?? 'Virgülle ayırın'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn-secondary btn-md shrink-0" onClick={add}>
          <Icon name="plus" size={14} />
        </button>
      </div>
    </div>
  );
}
