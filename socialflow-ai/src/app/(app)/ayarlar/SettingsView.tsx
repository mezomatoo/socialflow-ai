'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, Switch, Tabs, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { formatBytes } from '@/lib/format';
import {
  CONTENT_TYPE_LABELS,
  INTEGRATION_STATUS_LABELS,
  PLATFORM_META,
  type PlatformCode
} from '@/lib/platforms/platforms';

interface RuleView {
  id: string | null;
  platform: string;
  contentType: string;
  label: string;
  maxCaptionLength: number;
  recommendedCaptionLength: number;
  supportedAspectRatios: string[];
  recommendedAspectRatio: string;
  maxFileSize: number;
  maxVideoFileSize: number | null;
  maxMediaCount: number;
  maxHashtags: number;
  recommendedHashtags: number;
  clickableLinks: boolean;
  supportsScheduling: boolean;
  source: string;
}

interface IntegrationRow {
  platform: string;
  status: string;
  apiVersion: string | null;
  message: string | null;
  lastCheckedAt: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Sahip',
  ADMIN: 'Yönetici',
  EDITOR: 'Editör',
  APPROVER: 'Onaylayıcı',
  VIEWER: 'İzleyici'
};

export function SettingsView({
  role,
  workspace,
  branding,
  settings,
  rules,
  integrations
}: {
  role: string;
  workspace: { name: string; slug: string; plan: string; demoMode: boolean; timezone: string; locale: string };
  branding: Record<string, any>;
  settings: Record<string, any> | null;
  rules: RuleView[];
  integrations: IntegrationRow[];
}) {
  const canEdit = role === 'OWNER' || role === 'ADMIN';
  const [tab, setTab] = useState('genel');

  const tabs = [
    { id: 'genel', label: 'Genel', icon: <Icon name="settings" size={15} /> },
    { id: 'ai', label: 'Yapay Zeka', icon: <Icon name="sparkles" size={15} /> },
    { id: 'entegrasyonlar', label: 'Entegrasyonlar', icon: <Icon name="link" size={15} /> },
    { id: 'kurallar', label: 'Platform Kuralları', icon: <Icon name="sliders" size={15} />, count: rules.length },
    { id: 'calisma-alani', label: 'Çalışma Alanı', icon: <Icon name="brand" size={15} /> }
  ];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Ayarlar</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          Uygulama görünümü, yapay zeka, entegrasyonlar ve platform kuralları.
          {!canEdit && <span className="ml-1 text-warning">Düzenleme için yönetici yetkisi gerekir.</span>}
        </p>
      </div>

      <Tabs items={tabs} value={tab} onChange={setTab} />

      <div className="mt-5">
        {tab === 'genel' && <BrandingTab settings={settings} branding={branding} canEdit={canEdit} />}
        {tab === 'ai' && <AiTab settings={settings} canEdit={canEdit} />}
        {tab === 'entegrasyonlar' && <IntegrationsTab integrations={integrations} demoMode={workspace.demoMode} />}
        {tab === 'kurallar' && <RulesTab rules={rules} canEdit={canEdit} />}
        {tab === 'calisma-alani' && <WorkspaceTab workspace={workspace} role={role} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Genel */
function BrandingTab({ settings, branding, canEdit }: { settings: any; branding: any; canEdit: boolean }) {
  const toast = useToast();
  const [form, setForm] = useState({
    appName: settings?.appName ?? branding?.appName ?? 'SocialFlow AI',
    logoMark: settings?.logoMark ?? branding?.logoMark ?? 'SF',
    logoUrl: settings?.logoUrl ?? branding?.logoUrl ?? '',
    primaryColor: settings?.primaryColor ?? branding?.primaryColor ?? '#6D28D9',
    secondaryColor: settings?.secondaryColor ?? '#0EA5E9',
    accentColor: settings?.accentColor ?? '#F59E0B',
    radius: settings?.radius ?? '14px',
    fontFamily: settings?.fontFamily ?? 'Inter',
    demoBanner: settings?.demoBanner ?? true,
    demoMode: branding?.demoMode ?? false
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch('/api/settings/branding', form);
      toast.success('Ayarlar kaydedildi', 'Görünüm değişiklikleri yenilendi.');
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.error('Kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <header className="border-b border-line px-5 py-4">
        <h2 className="section-title">Uygulama Görünümü</h2>
        <p className="section-sub">Marka adı, logo ve renkler tüm arayüze uygulanır.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <Field label="Uygulama adı">
          <input className="input" disabled={!canEdit} value={form.appName} onChange={(e) => set('appName', e.target.value)} />
        </Field>
        <Field label="Logo kısaltması (2 harf)">
          <input className="input" disabled={!canEdit} maxLength={3} value={form.logoMark} onChange={(e) => set('logoMark', e.target.value)} />
        </Field>
        <Field label="Logo URL" className="sm:col-span-2">
          <input className="input" disabled={!canEdit} value={form.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} placeholder="/demo/logo.svg" />
        </Field>
        <ColorField label="Ana renk" value={form.primaryColor} disabled={!canEdit} onChange={(v) => set('primaryColor', v)} />
        <ColorField label="İkincil renk" value={form.secondaryColor} disabled={!canEdit} onChange={(v) => set('secondaryColor', v)} />
        <ColorField label="Vurgu rengi" value={form.accentColor} disabled={!canEdit} onChange={(v) => set('accentColor', v)} />
        <Field label="Köşe yuvarlaklığı">
          <input className="input" disabled={!canEdit} value={form.radius} onChange={(e) => set('radius', e.target.value)} placeholder="14px" />
        </Field>
        <Field label="Yazı tipi" className="sm:col-span-2">
          <input className="input" disabled={!canEdit} value={form.fontFamily} onChange={(e) => set('fontFamily', e.target.value)} />
        </Field>
        <div className="sm:col-span-2 space-y-3 border-t border-line pt-4">
          <Switch checked={form.demoBanner} disabled={!canEdit} onChange={(v) => set('demoBanner', v)} label="Demo modu uyarı şeridini göster" />
          <Switch checked={form.demoMode} disabled={!canEdit} onChange={(v) => set('demoMode', v)} label="Demo Modu (gerçek sosyal medya paylaşımı yapılmasın)" />
        </div>
      </div>
      {canEdit && (
        <footer className="flex justify-end border-t border-line px-5 py-3">
          <button className="btn-primary btn-md" onClick={save} disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
          </button>
        </footer>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- AI */
function AiTab({ settings, canEdit }: { settings: any; canEdit: boolean }) {
  const toast = useToast();
  const [form, setForm] = useState({
    aiProvider: settings?.aiProvider ?? 'deterministic',
    aiModel: settings?.aiModel ?? ''
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch('/api/settings/branding', form);
      toast.success('Yapay zeka ayarları kaydedildi');
    } catch (e) {
      toast.error('Kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <header className="border-b border-line px-5 py-4">
        <h2 className="section-title">Yapay Zeka Sağlayıcısı</h2>
        <p className="section-sub">Metin üretimi ve uyarlama motoru.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <Field label="Sağlayıcı">
          <select
            className="select"
            disabled={!canEdit}
            value={form.aiProvider}
            onChange={(e) => setForm((f) => ({ ...f, aiProvider: e.target.value }))}
          >
            <option value="deterministic">Yerel deterministik motor (anahtar gerektirmez)</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </Field>
        <Field label="Model">
          <input
            className="input"
            disabled={!canEdit}
            value={form.aiModel}
            onChange={(e) => setForm((f) => ({ ...f, aiModel: e.target.value }))}
            placeholder="Örn: gpt-4o-mini"
          />
        </Field>
        <div className="sm:col-span-2 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-[12.5px] text-ink">
          <p className="flex items-start gap-2">
            <Icon name="shield" size={15} className="mt-0.5 text-info" />
            <span>
              API anahtarları yalnızca sunucu tarafındaki ortam değişkenlerinde tutulur; istemciye asla gönderilmez. Anahtar
              tanımlı değilse sistem güvenli yerel motora düşer ve AI asla fiyat/tarih/iddia uydurmaz.
            </span>
          </p>
        </div>
      </div>
      {canEdit && (
        <footer className="flex justify-end border-t border-line px-5 py-3">
          <button className="btn-primary btn-md" onClick={save} disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </footer>
      )}
    </div>
  );
}

/* ------------------------------------------------------- Entegrasyonlar */
function IntegrationsTab({ integrations, demoMode }: { integrations: IntegrationRow[]; demoMode: boolean }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ items: any[] }>('/api/settings/integrations');
      setItems(res.items);
    } catch (e) {
      toast.error('Yüklenemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setLoading(false);
    }
  }

  if (!items) {
    return (
      <div className="card p-6 text-center">
        <p className="mb-3 text-[13px] text-ink-muted">
          Entegrasyon durumu; resmî API kimlik bilgilerinizin tanımlı olup olmadığını ve hesap bağlantılarını gösterir.
        </p>
        <button className="btn-primary btn-md" onClick={load} disabled={loading}>
          {loading ? 'Kontrol ediliyor…' : 'Entegrasyon Durumunu Yükle'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {demoMode && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[12.5px] text-ink">
          <Icon name="alert-triangle" size={16} className="mt-0.5 text-warning" />
          <p>
            <strong>Demo Modu etkin.</strong> Kimlik bilgisi tanımlı olmayan platformlar simülasyon olarak çalışır; gerçek
            paylaşım yapılmaz.
          </p>
        </div>
      )}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((it) => (
          <li key={it.platform} className="card card-pad">
            <div className="flex items-start gap-3">
              <PlatformIcon platform={it.platform} size={36} rounded="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14px] font-bold text-ink">{it.name}</p>
                  <Badge tone={it.credentialsSet ? 'success' : 'neutral'}>
                    {it.credentialsSet ? 'Kimlik tanımlı' : 'Kimlik yok'}
                  </Badge>
                </div>
                <p className="text-[12px] text-ink-faint">{it.officialApi}</p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  {INTEGRATION_STATUS_LABELS[it.status as keyof typeof INTEGRATION_STATUS_LABELS] ?? it.status} ·{' '}
                  {it.connectedAccounts} bağlı hesap
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {it.contentTypes.map((ct: string) => (
                    <span key={ct} className="chip">
                      {CONTENT_TYPE_LABELS[ct] ?? ct}
                    </span>
                  ))}
                </div>
                {it.docsUrl && (
                  <a href={it.docsUrl} target="_blank" rel="noreferrer" className="link mt-2 inline-flex items-center gap-1 text-[12px]">
                    Resmî API dokümantasyonu <Icon name="globe" size={12} />
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------- Kurallar */
function RulesTab({ rules, canEdit }: { rules: RuleView[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<RuleView | null>(null);
  const grouped = useMemo(() => {
    const map = new Map<string, RuleView[]>();
    for (const r of rules) {
      if (!map.has(r.platform)) map.set(r.platform, []);
      map.get(r.platform)!.push(r);
    }
    return Array.from(map.entries());
  }, [rules]);

  return (
    <div className="space-y-5">
      <p className="text-[12.5px] text-ink-muted">
        Karakter sınırları, oranlar, dosya boyutları ve yetenekler merkezî olarak buradan yönetilir. Değişiklikler tüm
        doğrulama ve AI uyarlama akışlarına anında yansır — hiçbir sınır koda gömülü değildir.
      </p>
      {grouped.map(([platform, list]) => (
        <section key={platform} className="card overflow-hidden">
          <header className="flex items-center gap-2 border-b border-line px-5 py-3">
            <PlatformIcon platform={platform} size={20} rounded="md" />
            <h3 className="section-title">{PLATFORM_META[platform as PlatformCode]?.name ?? platform}</h3>
            <span className="hint ml-auto">{list.length} içerik türü</span>
          </header>
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <li key={`${r.platform}:${r.contentType}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="w-32 text-[13px] font-semibold text-ink">{CONTENT_TYPE_LABELS[r.contentType] ?? r.contentType}</span>
                <RuleStat icon="text" label={`${r.maxCaptionLength} krk`} title="Maks. açıklama" />
                <RuleStat icon="shapes" label={r.recommendedAspectRatio} title="Önerilen oran" />
                <RuleStat icon="image" label={formatBytes(r.maxFileSize)} title="Maks. dosya" />
                <RuleStat icon="hashtag" label={`${r.recommendedHashtags}/${r.maxHashtags}`} title="Önerilen/maks. etiket" />
                {r.clickableLinks && <Badge tone="info">Tıklanabilir bağlantı</Badge>}
                <span className="ml-auto">
                  {canEdit && r.id ? (
                    <button className="btn-ghost btn-sm" onClick={() => setEditing(r)}>
                      <Icon name="edit" size={13} /> Düzenle
                    </button>
                  ) : (
                    <Badge tone="neutral">Yerleşik</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editing && <RuleEditor rule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleEditor({ rule, onClose }: { rule: RuleView; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    maxCaptionLength: rule.maxCaptionLength,
    recommendedCaptionLength: rule.recommendedCaptionLength,
    recommendedAspectRatio: rule.recommendedAspectRatio,
    maxHashtags: rule.maxHashtags,
    recommendedHashtags: rule.recommendedHashtags,
    maxMediaCount: rule.maxMediaCount,
    clickableLinks: rule.clickableLinks
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!rule.id) return;
    setSaving(true);
    try {
      await api.patch(`/api/rules/${rule.id}`, form);
      toast.success('Kural güncellendi', `${rule.label} için sınırlar kaydedildi.`);
      setTimeout(() => window.location.reload(), 500);
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
      title={`Kuralı Düzenle — ${rule.label}`}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary btn-md" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-primary btn-md" onClick={save} disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumField label="Maks. açıklama (karakter)" value={form.maxCaptionLength} onChange={(v) => setForm({ ...form, maxCaptionLength: v })} />
        <NumField label="Önerilen uzunluk" value={form.recommendedCaptionLength} onChange={(v) => setForm({ ...form, recommendedCaptionLength: v })} />
        <Field label="Önerilen oran">
          <input className="input" value={form.recommendedAspectRatio} onChange={(e) => setForm({ ...form, recommendedAspectRatio: e.target.value })} />
        </Field>
        <NumField label="Maks. medya sayısı" value={form.maxMediaCount} onChange={(v) => setForm({ ...form, maxMediaCount: v })} />
        <NumField label="Maks. hashtag" value={form.maxHashtags} onChange={(v) => setForm({ ...form, maxHashtags: v })} />
        <NumField label="Önerilen hashtag" value={form.recommendedHashtags} onChange={(v) => setForm({ ...form, recommendedHashtags: v })} />
        <div className="sm:col-span-2">
          <Switch checked={form.clickableLinks} onChange={(v) => setForm({ ...form, clickableLinks: v })} label="Bağlantılar tıklanabilir" />
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- Çalışma Alanı */
function WorkspaceTab({ workspace, role }: { workspace: any; role: string }) {
  return (
    <div className="card">
      <header className="border-b border-line px-5 py-4">
        <h2 className="section-title">Çalışma Alanı</h2>
        <p className="section-sub">Kuruluş bilgileri ve yerel ayarlar.</p>
      </header>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
        <InfoRow label="Çalışma alanı adı" value={workspace.name} />
        <InfoRow label="Tanıtıcı (slug)" value={workspace.slug} />
        <InfoRow label="Plan" value={workspace.plan} />
        <InfoRow label="Rolünüz" value={ROLE_LABELS[role] ?? role} />
        <InfoRow label="Zaman dilimi" value={workspace.timezone} />
        <InfoRow label="Dil" value={workspace.locale === 'tr' ? 'Türkçe' : workspace.locale} />
        <InfoRow label="Demo Modu" value={workspace.demoMode ? 'Etkin' : 'Kapalı'} />
      </dl>
      <div className="border-t border-line px-5 py-3">
        <p className="hint">
          Tarih biçimi GG.AA.YYYY, saat 24 saat dilimi, para birimi ₺ (TRY) ve varsayılan zaman dilimi Europe/Istanbul olarak
          uygulanır.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Yardımcı */
function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" disabled={disabled} className="h-9 w-12 cursor-pointer rounded border border-line" value={value} onChange={(e) => onChange(e.target.value)} />
        <input className="input" disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <input className="input" type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

function RuleStat({ icon, label, title }: { icon: string; label: string; title: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-faint" title={title}>
      <Icon name={icon} size={12} /> {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="hint">{label}</dt>
      <dd className="text-[13.5px] font-medium text-ink">{value}</dd>
    </div>
  );
}
