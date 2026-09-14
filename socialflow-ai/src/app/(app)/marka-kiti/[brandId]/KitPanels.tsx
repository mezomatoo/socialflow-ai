'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, EmptyState, Modal, Switch, Spinner, Segmented } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import {
  LOCK_MODES, LOCK_MODE_LABELS, LOCK_MODE_DESCRIPTIONS,
  CONSISTENCY_GATES, CONSISTENCY_GATE_LABELS, type LockMode, type ConsistencyGate
} from '@/lib/brandkit/constants';

function csv(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.join(', ') : ''; } catch { return ''; }
  }
  return typeof v === 'string' ? v : '';
}
function toJsonArr(s: string): string {
  return JSON.stringify(s.split(',').map((x) => x.trim()).filter(Boolean));
}

function Labeled({ label, children, wide, hint }: { label: string; children: React.ReactNode; wide?: boolean; hint?: string }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="mb-1 block text-[12.5px] font-semibold text-ink">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-[11.5px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

/* ============================================================ Genel Bilgiler */
const GEN_FIELDS: { name: string; label: string; type: 'string' | 'int' | 'text' | 'tags' }[] = [
  { name: 'shortName', label: 'Kısa Ad', type: 'string' },
  { name: 'legalName', label: 'Yasal Ünvan', type: 'string' },
  { name: 'mainSlogan', label: 'Ana Slogan', type: 'string' },
  { name: 'subSlogan', label: 'Alt Slogan', type: 'string' },
  { name: 'industry', label: 'Sektör', type: 'string' },
  { name: 'subIndustry', label: 'Alt Sektör', type: 'string' },
  { name: 'foundedYear', label: 'Kuruluş Yılı', type: 'int' },
  { name: 'country', label: 'Ülke', type: 'string' },
  { name: 'mainMarket', label: 'Ana Pazar', type: 'string' },
  { name: 'mainLanguage', label: 'Ana Dil', type: 'string' },
  { name: 'shortDescription', label: 'Kısa Açıklama', type: 'text' },
  { name: 'longDescription', label: 'Uzun Açıklama', type: 'text' },
  { name: 'targetMarkets', label: 'Hedef Pazarlar', type: 'tags' },
  { name: 'supportedLanguages', label: 'Desteklenen Diller', type: 'tags' }
];
const CONTACT_FIELDS: { name: string; label: string; type: 'string' | 'text' }[] = [
  { name: 'phone', label: 'Telefon', type: 'string' },
  { name: 'email', label: 'E-posta', type: 'string' },
  { name: 'whatsapp', label: 'WhatsApp', type: 'string' },
  { name: 'supportLine', label: 'Destek Hattı', type: 'string' },
  { name: 'workingHours', label: 'Çalışma Saatleri', type: 'string' },
  { name: 'address', label: 'Adres', type: 'text' }
];

export function GeneralPanel({ kit, canEdit, onChanged }: { kit: any; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const init = () => {
    const f: Record<string, any> = {};
    for (const x of [...GEN_FIELDS, ...CONTACT_FIELDS]) {
      f[x.name] = x.type === 'tags' ? csv(kit[x.name]) : kit[x.name] ?? '';
    }
    return f;
  };
  const [form, setForm] = useState<Record<string, any>>(init);

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, any> = { ...form };
      payload.targetMarkets = toJsonArr(form.targetMarkets || '');
      payload.supportedLanguages = toJsonArr(form.supportedLanguages || '');
      if (payload.foundedYear === '') payload.foundedYear = null;
      await api.patch(`/api/brands/${kit.brandId}/marka-kiti`, payload);
      toast.success('Kaydedildi', 'Genel bilgiler güncellendi.');
      onChanged();
    } catch (e) {
      toast.error('Kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <Section title="Marka Kimliği" subtitle="AI tüm içeriklerde bu bilgileri temel alır.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {GEN_FIELDS.map((f) => (
            <Labeled key={f.name} label={f.label} wide={f.type === 'text' || f.type === 'tags'} hint={f.type === 'tags' ? 'Virgülle ayırın.' : undefined}>
              {f.type === 'text' ? (
                <textarea className="input min-h-[70px] resize-y" disabled={!canEdit} value={form[f.name]} onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))} />
              ) : f.type === 'int' ? (
                <input className="input" type="number" disabled={!canEdit} value={form[f.name]} onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))} />
              ) : (
                <input className="input" disabled={!canEdit} value={form[f.name]} onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))} />
              )}
            </Labeled>
          ))}
        </div>
      </Section>

      <Section title="İletişim" subtitle="AI bu bilgileri asla uydurmaz; yalnızca buradan okur.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CONTACT_FIELDS.map((f) => (
            <Labeled key={f.name} label={f.label} wide={f.type === 'text'}>
              {f.type === 'text' ? (
                <textarea className="input min-h-[60px] resize-y" disabled={!canEdit} value={form[f.name]} onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))} />
              ) : (
                <input className="input" disabled={!canEdit} value={form[f.name]} onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))} />
              )}
            </Labeled>
          ))}
        </div>
      </Section>

      {canEdit ? (
        <div className="flex justify-end">
          <button className="btn-primary btn-md" onClick={save} disabled={saving}>
            {saving ? <Spinner size={15} /> : <Icon name="save" size={15} />} Değişiklikleri Kaydet
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-3.5">
        <h3 className="section-title">{title}</h3>
        {subtitle ? <p className="section-sub">{subtitle}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/* =============================================================== AI Kuralları */
export function AiRulesPanel({ kit, canLock, onChanged }: { kit: any; canLock: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [lockMode, setLockMode] = useState<LockMode>((kit.lockMode as LockMode) ?? 'OFF');
  const [gate, setGate] = useState<ConsistencyGate>((kit.consistencyGate as ConsistencyGate) ?? 'WARNING');
  const [learn, setLearn] = useState<boolean>(!!kit.learnFromApproved);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/api/brands/${kit.brandId}/marka-kiti`, { lockMode, consistencyGate: gate, learnFromApproved: learn });
      toast.success('Kaydedildi', 'AI kuralları güncellendi.');
      onChanged();
    } catch (e) {
      toast.error('Kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-brand-50/50 px-4 py-3 text-[12.5px] leading-relaxed text-ink-muted">
        <Icon name="shield" size={16} />
        <span>
          Varsayılan AI özerkliği <b>Seviye 1 — Sadece Öneri</b>. AI; markayı, fiyatları, tarihleri, ürünleri veya yasal
          metinleri kendiliğinden değiştirmez, onaylamaz ya da yayınlamaz. Aşağıdaki kilit ve kapı ayarları bu garantiyi güçlendirir.
        </span>
      </div>

      <Section title="Marka Kilidi" subtitle="Marka kimliğinin AI ve ekip tarafından değiştirilme serbestliği.">
        <Segmented
          options={LOCK_MODES.map((m) => ({ value: m, label: LOCK_MODE_LABELS[m] }))}
          value={lockMode}
          onChange={(v) => canLock && setLockMode(v)}
        />
        <p className="mt-2 text-[12.5px] text-ink-muted">{LOCK_MODE_DESCRIPTIONS[lockMode]}</p>
      </Section>

      <Section title="Yayın Öncesi Marka Tutarlılığı" subtitle="İçerik marka kitine uymadığında ne yapılsın?">
        <Segmented
          options={CONSISTENCY_GATES.map((g) => ({ value: g, label: CONSISTENCY_GATE_LABELS[g] }))}
          value={gate}
          onChange={(v) => canLock && setGate(v)}
        />
      </Section>

      <Section title="Marka Hafızası Öğrenmesi" subtitle="Onaylı içerikten stil tercihi öğrenme (varsayılan kapalı).">
        <Switch checked={learn} disabled={!canLock} onChange={setLearn} label="Onaylı içerikten öğren" hint="Yalnızca onayladığınız içerikler marka hafızasını besler." />
      </Section>

      {canLock ? (
        <div className="flex justify-end">
          <button className="btn-primary btn-md" onClick={save} disabled={saving}>
            {saving ? <Spinner size={15} /> : <Icon name="save" size={15} />} Kaydet
          </button>
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-faint">Bu ayarları yalnızca Sahip/Yönetici değiştirebilir.</p>
      )}
    </div>
  );
}

/* ============================================================== Marka Dili */
export function VoicePanel({ kit, canEdit, onChanged }: { kit: any; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const voice = kit.brand?.voice ?? null;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    tone: voice?.tone ?? 'profesyonel ve samimi',
    personality: voice?.personality ?? '',
    audience: voice?.audience ?? '',
    formality: voice?.formality ?? 'NEUTRAL',
    emojiLevel: voice?.emojiLevel ?? 'MEDIUM',
    allowedTerms: csv(voice?.allowedTerms),
    bannedTerms: csv(voice?.bannedTerms),
    mustKeepTerms: csv(voice?.mustKeepTerms)
  }));

  async function save() {
    setSaving(true);
    try {
      const toArr = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
      await api.patch(`/api/brands/${kit.brandId}`, {
        voice: {
          tone: form.tone, personality: form.personality || null, audience: form.audience || null,
          formality: form.formality, emojiLevel: form.emojiLevel,
          allowedTerms: toArr(form.allowedTerms), bannedTerms: toArr(form.bannedTerms), mustKeepTerms: toArr(form.mustKeepTerms)
        }
      });
      toast.success('Kaydedildi', 'Marka dili güncellendi.');
      onChanged();
    } catch (e) {
      toast.error('Kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <Section title="Marka Dili" subtitle="Mevcut marka sesi profili (BrandVoice). AI caption üretimi bunu kullanır.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Labeled label="Ton"><input className="input" disabled={!canEdit} value={form.tone} onChange={(e) => setForm((p) => ({ ...p, tone: e.target.value }))} /></Labeled>
          <Labeled label="Kişilik"><input className="input" disabled={!canEdit} value={form.personality} onChange={(e) => setForm((p) => ({ ...p, personality: e.target.value }))} /></Labeled>
          <Labeled label="Hedef Kitle"><input className="input" disabled={!canEdit} value={form.audience} onChange={(e) => setForm((p) => ({ ...p, audience: e.target.value }))} /></Labeled>
          <Labeled label="Biçimsellik">
            <select className="input" disabled={!canEdit} value={form.formality} onChange={(e) => setForm((p) => ({ ...p, formality: e.target.value }))}>
              <option value="FORMAL">Resmî</option><option value="NEUTRAL">Nötr</option><option value="CASUAL">Samimi</option>
            </select>
          </Labeled>
          <Labeled label="Emoji Seviyesi">
            <select className="input" disabled={!canEdit} value={form.emojiLevel} onChange={(e) => setForm((p) => ({ ...p, emojiLevel: e.target.value }))}>
              <option value="NONE">Yok</option><option value="LOW">Az</option><option value="MEDIUM">Orta</option><option value="HIGH">Çok</option>
            </select>
          </Labeled>
          <Labeled label="İzin Verilen Terimler" wide hint="Virgülle ayırın."><input className="input" disabled={!canEdit} value={form.allowedTerms} onChange={(e) => setForm((p) => ({ ...p, allowedTerms: e.target.value }))} /></Labeled>
          <Labeled label="Yasaklı Terimler" wide hint="Virgülle ayırın."><input className="input" disabled={!canEdit} value={form.bannedTerms} onChange={(e) => setForm((p) => ({ ...p, bannedTerms: e.target.value }))} /></Labeled>
          <Labeled label="Korunacak Terimler" wide hint="Fiyat, ürün adı, tarih vb. — AI bunları asla çıkarmaz."><input className="input" disabled={!canEdit} value={form.mustKeepTerms} onChange={(e) => setForm((p) => ({ ...p, mustKeepTerms: e.target.value }))} /></Labeled>
        </div>
      </Section>
      {canEdit ? (
        <div className="flex justify-end">
          <button className="btn-primary btn-md" onClick={save} disabled={saving}>{saving ? <Spinner size={15} /> : <Icon name="save" size={15} />} Kaydet</button>
        </div>
      ) : null}
    </div>
  );
}

/* ========================================================== Sürüm Geçmişi */
export function VersionsPanel({ brandId, currentVersion, canEdit }: { brandId: string; currentVersion: number; canEdit: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setRows(await api.get<any[]>(`/api/brands/${brandId}/marka-kiti/versions`)); }
    catch (e) { toast.error('Yüklenemedi', e instanceof ApiError ? e.message : 'Hata.'); setRows([]); }
  }
  useEffect(() => { void load(); /* ilk yükleme */ }, [brandId]);

  async function create() {
    setBusy(true);
    try {
      await api.post(`/api/brands/${brandId}/marka-kiti/versions`, { note });
      toast.success('Sürüm oluşturuldu');
      setOpen(false); setNote(''); await load();
    } catch (e) { toast.error('Oluşturulamadı', e instanceof ApiError ? e.message : 'Hata.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-ink-muted">Geçerli sürüm: <b>v{currentVersion}</b></p>
        {canEdit ? <button className="btn-primary btn-sm" onClick={() => setOpen(true)}><Icon name="history" size={15} /> Yeni Sürüm</button> : null}
      </div>

      {rows === null ? (
        <div className="card flex items-center justify-center p-8 text-ink-muted"><Spinner size={18} /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon="history" title="Henüz sürüm yok" description="Marka kitinde bir anlık görüntü oluşturarak geçmişi başlatın." />
      ) : (
        <ul className="space-y-2">
          {rows.map((v) => (
            <li key={v.id} className="card flex items-center gap-3 p-3.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon name="layers" size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-ink">{v.label ?? `v${v.version}`}</p>
                <p className="truncate text-[12px] text-ink-muted">{v.note || 'Not yok'} · {new Date(v.createdAt).toLocaleString('tr-TR')}</p>
              </div>
              <Badge tone="neutral">v{v.version}</Badge>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Yeni Sürüm Oluştur" description="Marka kitinin tam anlık görüntüsü kaydedilir."
        footer={<><button className="btn-ghost btn-md" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button><button className="btn-primary btn-md" onClick={create} disabled={busy}>{busy ? <Spinner size={15} /> : <Icon name="save" size={15} />} Oluştur</button></>}>
        <Labeled label="Not (isteğe bağlı)"><textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. Sonbahar kampanyası öncesi güncelleme" /></Labeled>
      </Modal>
    </div>
  );
}

/* =============================================== Ürün / Şablon bilgilendirme */
export function InfoPanel({ icon, title, description }: { icon: string; title: string; description: string }) {
  return <EmptyState icon={icon} title={title} description={description} />;
}
