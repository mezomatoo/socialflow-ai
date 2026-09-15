'use client';

import { useEffect, useMemo, useState } from 'react';
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
        {tab === 'entegrasyonlar' && <IntegrationsTab integrations={integrations} demoMode={workspace.demoMode} canEdit={canEdit} />}
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
    fontFamily: settings?.fontFamily ?? 'Inter'
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

interface AiSettingsResponse {
  provider: 'deterministic' | 'openai' | 'anthropic' | 'gemini';
  model: string | null;
  baseUrl: string | null;
  hasKey: boolean;
  keyMasked: string | null;
  keyFromWorkspace: boolean;
  activeEngine: string;
  defaults: Record<string, { model: string; baseUrl: string; label: string; keyPlaceholder: string; models: string[] }>;
}

interface AiTestResult {
  ok: boolean;
  provider: string;
  model: string | null;
  ms: number;
  message: string;
}

const AI_PROVIDER_CARDS: { id: string; name: string; icon: 'zap' | 'sparkles' | 'shield' | 'globe'; tagline: string; desc: string; badge: string }[] = [
  {
    id: 'deterministic',
    name: 'Yerel Motor',
    icon: 'zap',
    tagline: 'Anahtar gerektirmez',
    desc: 'Sınırsız ve ücretsiz. Güvenli, kural tabanlı üretim — dış servis çağrısı yapılmaz.',
    badge: 'Sınırsız'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: 'sparkles',
    tagline: 'GPT-4o serisi',
    desc: 'En yüksek metin kalitesi; kampanya ve gönderi metinlerinde premium sonuçlar.',
    badge: 'Premium'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: 'shield',
    tagline: 'Claude serisi',
    desc: 'Doğal, akıcı Türkçe; marka sesi ve uzun yönergelerde güçlü takip.',
    badge: 'Premium'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    icon: 'globe',
    tagline: 'Gemini Flash / Pro',
    desc: 'Hızlı ve ekonomik; yüksek hacimli içerik üretiminde ideal denge.',
    badge: 'Premium'
  }
];

function AiTab({ canEdit }: { settings: any; canEdit: boolean }) {
  const toast = useToast();
  const [cfg, setCfg] = useState<AiSettingsResponse | null>(null);
  const [provider, setProvider] = useState('deterministic');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [keyMode, setKeyMode] = useState<'keep' | 'set' | 'clear'>('keep');
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<AiTestResult | null>(null);
  const [catalog, setCatalog] = useState<{ source: 'live' | 'builtin'; models: string[]; note?: string } | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [modelQuery, setModelQuery] = useState('');

  async function load() {
    try {
      const res = await api.get<AiSettingsResponse>('/api/settings/ai');
      setCfg(res);
      setProvider(res.provider);
      setModel(res.model ?? '');
      setBaseUrl(res.baseUrl ?? '');
    } catch {
      toast.error('Ayarlar yüklenemedi', 'Sayfayı yenileyip tekrar deneyin.');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const defaults = cfg?.defaults?.[provider];
  const external = provider !== 'deterministic';
  const showKeyInput = external && (keyMode === 'set' || !cfg?.hasKey || cfg?.keyFromWorkspace === false);

  async function fetchCatalog(nextProvider?: string, nextKeyInput?: string) {
    const p = nextProvider ?? provider;
    if (p === 'deterministic') return;
    setCatalogLoading(true);
    setModelQuery('');
    try {
      const params = new URLSearchParams({ provider: p });
      const k = nextKeyInput ?? (keyMode === 'set' ? keyInput.trim() : '');
      if (k) params.set('apiKey', k);
      if (baseUrl.trim()) params.set('baseUrl', baseUrl.trim());
      const res = await api.get<{ source: 'live' | 'builtin'; models: string[]; note?: string }>(
        `/api/settings/ai/models?${params.toString()}`
      );
      setCatalog(res);
    } catch {
      setCatalog({ source: 'builtin', models: cfg?.defaults?.[p]?.models ?? [], note: 'Model listesi alınamadı.' });
    } finally {
      setCatalogLoading(false);
    }
  }

  function pickProvider(id: string) {
    if (!canEdit) return;
    setProvider(id);
    setTest(null);
    if (id !== 'deterministic') {
      const d = cfg?.defaults?.[id];
      // Model boşsa veya başka sağlayıcının varsayılanıysa önerileni doldur.
      const knownDefaults = Object.values(cfg?.defaults ?? {}).map((x) => x.model);
      if (d && (!model.trim() || knownDefaults.includes(model.trim()))) setModel(d.model);
      void fetchCatalog(id);
    } else {
      setCatalog(null);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        aiProvider: provider,
        aiModel: model.trim() || null,
        aiBaseUrl: baseUrl.trim() || null
      };
      if (keyMode === 'set') payload.aiApiKey = keyInput.trim();
      if (keyMode === 'clear') payload.aiApiKey = null;
      await api.patch('/api/settings/ai', payload);
      toast.success('Yapay zeka ayarları kaydedildi', 'Yeni sağlayıcı anında etkinleştirildi.');
      setKeyMode('keep');
      setKeyInput('');
      await load();
    } catch (e) {
      toast.error('Kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const payload: Record<string, unknown> = { aiProvider: provider, aiModel: model.trim() || null, aiBaseUrl: baseUrl.trim() || null };
      if (keyMode === 'set' && keyInput.trim()) payload.aiApiKey = keyInput.trim();
      const res = await api.post<AiTestResult>('/api/settings/ai/test', payload);
      setTest(res);
      if (res.ok) toast.success('Bağlantı testi başarılı', `${res.model ?? provider} · ${res.ms} ms`);
      else toast.error('Bağlantı testi başarısız', res.message);
    } catch (e) {
      setTest({ ok: false, provider, model: model || null, ms: 0, message: e instanceof ApiError ? e.message : 'Test yapılamadı.' });
    } finally {
      setTesting(false);
    }
  }

  if (!cfg) {
    return (
      <div className="card p-8 text-center text-[13px] text-ink-muted">
        Yapay zeka ayarları yükleniyor…
      </div>
    );
  }

  return (
    <div className="card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="section-title">Yapay Zeka Sağlayıcısı</h2>
          <p className="section-sub">Metin üretimi, uyarlama ve hashtag motoru.</p>
        </div>
        {cfg.activeEngine !== 'deterministic' ? (
          <Badge tone="success">
            <Icon name="check-circle" size={12} /> Aktif motor: {cfg.activeEngine === 'openai' ? 'OpenAI' : cfg.activeEngine === 'anthropic' ? 'Anthropic' : 'Google Gemini'}
          </Badge>
        ) : (
          <Badge tone="info">
            <Icon name="zap" size={12} /> Aktif motor: Yerel (anahtarsız)
          </Badge>
        )}
      </header>

      <div className="space-y-5 p-5">
        {/* Sağlayıcı kartları */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AI_PROVIDER_CARDS.map((card) => {
            const active = provider === card.id;
            return (
              <button
                key={card.id}
                type="button"
                disabled={!canEdit}
                onClick={() => pickProvider(card.id)}
                className={`relative rounded-xl border p-4 text-left transition-all ${
                  active
                    ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-300/50'
                    : 'border-line bg-surface hover:border-brand-300 hover:bg-surface-subtle'
                } ${!canEdit ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${active ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink-muted'}`}>
                    <Icon name={card.icon} size={18} />
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${card.badge === 'Premium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {card.badge}
                  </span>
                </div>
                <p className="mt-3 text-[14px] font-bold text-ink">{card.name}</p>
                <p className="text-[11.5px] font-semibold text-brand-600">{card.tagline}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{card.desc}</p>
                {active && (
                  <span className="absolute right-3 top-3 hidden text-brand-600 sm:block">
                    <Icon name="check-circle" size={16} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Harici sağlayıcı yapılandırması */}
        {external && (
          <div className="space-y-4 rounded-xl border border-line bg-surface-subtle/60 p-4">
            {/* API anahtarı */}
            <div>
              <label className="label flex items-center gap-1.5">
                <Icon name="key" size={13} /> API Anahtarı
              </label>
              {cfg.hasKey && keyMode === 'keep' ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
                  <Icon name="check-circle" size={15} className="text-success" />
                  <code className="font-mono text-[12.5px] text-ink">{cfg.keyMasked}</code>
                  <span className="text-[11.5px] text-ink-faint">
                    {cfg.keyFromWorkspace ? 'Bu çalışma alanına kayıtlı anahtar' : 'Sunucu ortam değişkeninden'}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <button type="button" className="btn-secondary btn-sm" disabled={!canEdit} onClick={() => { setKeyMode('set'); setKeyInput(''); }}>
                      Değiştir
                    </button>
                    {cfg.keyFromWorkspace && (
                      <button type="button" className="btn-secondary btn-sm text-danger" disabled={!canEdit} onClick={() => setKeyMode('clear')}>
                        Sil
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <input
                    className="input pr-10 font-mono"
                    type={showKey ? 'text' : 'password'}
                    disabled={!canEdit}
                    value={keyMode === 'clear' ? '' : keyInput}
                    onChange={(e) => { setKeyMode('set'); setKeyInput(e.target.value); }}
                    placeholder={defaults?.keyPlaceholder ?? 'API anahtarınız'}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? 'Anahtarı gizle' : 'Anahtarı göster'}
                  >
                    <Icon name={showKey ? 'eye-off' : 'eye'} size={16} />
                  </button>
                </div>
              )}
              {keyMode === 'clear' && (
                <p className="mt-1.5 text-[11.5px] font-semibold text-warning">Kayıtlı anahtar silinecek. Kaydedinceye kadar vazgeçebilirsiniz.</p>
              )}
              <p className="mt-1.5 text-[11.5px] text-ink-faint">
                {provider === 'openai' && 'platform.openai.com → API Keys sayfasından alınır (sk-... ile başlar).'}
                {provider === 'anthropic' && 'console.anthropic.com → API Keys sayfasından alınır (sk-ant-... ile başlar).'}
                {provider === 'gemini' && 'aistudio.google.com → "Get API key" ile alınır (AIza... ile başlar).'}
              </p>
            </div>

            {/* Model */}
            <div>
              <label className="label">Model</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono"
                  disabled={!canEdit}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={defaults?.model}
                />
                <button
                  type="button"
                  className="btn-secondary btn-md shrink-0"
                  disabled={catalogLoading || !canEdit}
                  onClick={() => fetchCatalog()}
                  title="Sağlayıcının güncel model listesini API üzerinden getir"
                >
                  <Icon name="refresh" size={14} /> {catalogLoading ? 'Alınıyor…' : 'Güncel Liste'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(defaults?.models ?? []).slice(0, 6).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setModel(m)}
                    className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                      model === m ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-muted hover:border-brand-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Sağlayıcıdan canlı model kataloğu */}
              {catalog && (
                <div className="mt-2 rounded-lg border border-line bg-surface">
                  <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                    {catalog.source === 'live' ? (
                      <Badge tone="success">
                        <Icon name="check-circle" size={11} /> Canlı liste · {catalog.models.length} model
                      </Badge>
                    ) : (
                      <Badge tone="info">
                        <Icon name="info" size={11} /> Bilinen güncel liste
                      </Badge>
                    )}
                    <div className="relative ml-auto min-w-[140px] flex-1 sm:max-w-[220px]">
                      <Icon name="search" size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
                      <input
                        className="input h-7 pl-7 text-[12px]"
                        placeholder="Model ara…"
                        value={modelQuery}
                        onChange={(e) => setModelQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  {catalog.note && (
                    <p className="border-b border-line bg-info/8 px-3 py-2 text-[11.5px] leading-relaxed text-ink-muted">{catalog.note}</p>
                  )}
                  <div className="max-h-48 overflow-y-auto p-2">
                    {catalog.models
                      .filter((m) => !modelQuery.trim() || m.toLowerCase().includes(modelQuery.trim().toLowerCase()))
                      .map((m) => (
                        <button
                          key={m}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setModel(m)}
                          className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left font-mono text-[12px] transition-colors ${
                            model === m ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink'
                          }`}
                        >
                          <span>{m}</span>
                          {model === m && <Icon name="check" size={13} />}
                        </button>
                      ))}
                    {catalog.models.filter((m) => !modelQuery.trim() || m.toLowerCase().includes(modelQuery.trim().toLowerCase())).length === 0 && (
                      <p className="px-2.5 py-2 text-[12px] text-ink-faint">Eşleşen model yok.</p>
                    )}
                  </div>
                </div>
              )}
              <p className="mt-1.5 text-[11.5px] text-ink-faint">
                Listede olmayan veya özel (fine-tune) bir model kullanmak için kimliği doğrudan yazabilirsiniz.
              </p>
            </div>

            {/* Gelişmiş */}
            <details className="group">
              <summary className="cursor-pointer select-none text-[12px] font-semibold text-ink-muted hover:text-ink">
                Gelişmiş: özel taban URL (kurumsal ağ geçitleri)
              </summary>
              <input
                className="input mt-2 font-mono"
                disabled={!canEdit}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={defaults?.baseUrl}
              />
              <p className="mt-1.5 text-[11.5px] text-ink-faint">Boş bırakılırsa sağlayıcının resmî uç noktası kullanılır.</p>
            </details>
          </div>
        )}

        {/* Test sonucu */}
        {test && (
          <div
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-[12.5px] ${
              test.ok ? 'border-success/40 bg-success/10 text-ink' : 'border-danger/40 bg-danger/10 text-ink'
            }`}
          >
            <Icon name={test.ok ? 'check-circle' : 'x-circle'} size={16} className={test.ok ? 'mt-0.5 text-success' : 'mt-0.5 text-danger'} />
            <div>
              <p className="font-semibold">{test.ok ? 'Bağlantı başarılı' : 'Bağlantı kurulamadı'}</p>
              <p className="mt-0.5 text-ink-muted">
                {test.message}
                {test.ok && test.model ? ` · ${test.model} · ${test.ms} ms` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Güvenlik ve limit bilgisi */}
        <div className="space-y-2 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-[12.5px] text-ink">
          <p className="flex items-start gap-2">
            <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-info" />
            <span>
              <strong>Güvenlik:</strong> API anahtarınız AES-256 ile şifrelenerek yalnızca sunucuda saklanır; tarayıcıya asla
              geri gönderilmez. Anahtar tanımlı değilse sistem otomatik olarak yerel motora düşer — içerik üretimi hiçbir
              zaman kesilmez ve AI asla fiyat/tarih/iddia uydurmaz.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Icon name="zap" size={15} className="mt-0.5 shrink-0 text-info" />
            <span>
              <strong>Limit var mı?</strong> Yerel motor tamamen sınırsızdır. Premium sağlayıcılarda kullanım, kendi API
              hesabınızın kotasına göre işler (kullandıkça öde); uygulama tarafından eklenen hiçbir yapay limit yoktur.
            </span>
          </p>
        </div>
      </div>

      {canEdit && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
          <button className="btn-secondary btn-md" onClick={runTest} disabled={testing}>
            {testing ? 'Test ediliyor…' : 'Bağlantıyı Test Et'}
          </button>
          <button className="btn-primary btn-md" onClick={save} disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet ve Etkinleştir'}
          </button>
        </footer>
      )}
    </div>
  );
}

/* ------------------------------------------------------- Entegrasyonlar */
/** Platform kimliği nasıl alınır — kısa Türkçe rehber. */
const CREDENTIAL_GUIDE: Record<string, { idLabel: string; secretLabel: string; guide: string }> = {
  INSTAGRAM: {
    idLabel: 'App ID',
    secretLabel: 'App Secret',
    guide:
      'developers.facebook.com → Uygulamalar → yeni uygulama oluşturun ve "Instagram Graph API" ürününü ekleyin. Instagram Business/Creator hesabınız bir Facebook Sayfasına bağlı olmalıdır.'
  },
  FACEBOOK: {
    idLabel: 'App ID',
    secretLabel: 'App Secret',
    guide: 'developers.facebook.com üzerinden uygulama oluşturun; Facebook Login ve Graph API ürünlerini ekleyin.'
  },
  X: {
    idLabel: 'Client ID',
    secretLabel: 'Client Secret',
    guide:
      'developer.x.com portalında bir Project ve App oluşturun (ücretli plan gerekebilir); OAuth 2.0 kullanıcı yetkilendirmesini etkinleştirin.'
  },
  LINKEDIN: {
    idLabel: 'Client ID',
    secretLabel: 'Client Secret',
    guide: 'linkedin.com/developers sayfasından uygulama oluşturun ve "Share on LinkedIn" ürününü etkinleştirin.'
  },
  TIKTOK: {
    idLabel: 'Client Key',
    secretLabel: 'Client Secret',
    guide:
      'developers.tiktok.com üzerinden uygulama kaydedin ve "Content Posting API" erişimi isteyin (inceleme/onay süreci vardır).'
  },
  YOUTUBE: {
    idLabel: 'Client ID',
    secretLabel: 'Client Secret',
    guide:
      'console.cloud.google.com → "OAuth istemci kimliği" (Web uygulaması) oluşturun ve "YouTube Data API v3"ü etkinleştirin.'
  },
  THREADS: {
    idLabel: 'App ID',
    secretLabel: 'App Secret',
    guide: 'developers.facebook.com üzerinden uygulama oluşturun ve "Threads API" ürününü ekleyin.'
  },
  PINTEREST: {
    idLabel: 'App ID',
    secretLabel: 'App Secret',
    guide:
      'developers.pinterest.com üzerinden uygulama oluşturun; OAuth yönlendirme adresine bu kurulumun adresini ekleyin.'
  },
  GOOGLE_BUSINESS: {
    idLabel: 'Client ID',
    secretLabel: 'Client Secret',
    guide:
      'console.cloud.google.com → "OAuth istemci kimliği" oluşturun ve "Google Business Profile API"yi etkinleştirin.'
  }
};

function IntegrationsTab({ demoMode, canEdit }: { integrations: IntegrationRow[]; demoMode: boolean; canEdit: boolean }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<any | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCredentialModal(it: any) {
    setModal(it);
    setClientId('');
    setClientSecret('');
    setShowSecret(false);
  }

  async function saveCredentials() {
    if (!modal) return;
    setSaving(true);
    try {
      await api.put(`/api/settings/integrations/${modal.platform}`, {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim()
      });
      toast.success('Kimlik kaydedildi', `${modal.name} artık gerçek OAuth bağlantısına hazır.`);
      setModal(null);
      await load();
    } catch (e) {
      toast.error('Kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setSaving(false);
    }
  }

  async function clearCredentials(it: any) {
    try {
      await api.del(`/api/settings/integrations/${it.platform}`);
      toast.success('Kimlik silindi', `${it.name} için çalışma alanı kimliği kaldırıldı.`);
      await load();
    } catch (e) {
      toast.error('Silinemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    }
  }

  const guide = modal ? CREDENTIAL_GUIDE[modal.platform] : null;
  const callbackUrl =
    modal && typeof window !== 'undefined'
      ? `${window.location.origin}/api/auth/${modal.platform.toLowerCase()}/callback`
      : '';

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-[12.5px] text-ink">
        <Icon name="key" size={16} className="mt-0.5 shrink-0 text-info" />
        <p>
          Her platform için kendi API uygulamanızın kimliklerini girin; secret <strong>AES-256 ile şifrelenerek</strong>{' '}
          saklanır ve bir daha asla gösterilmez. Kimlik tanımlanınca o platformda gerçek OAuth bağlantısı ve gerçek
          yayınlama açılır. Kimlik girilmezse platform simülasyon olarak çalışmaya devam eder.
        </p>
      </div>

      {!items ? (
        <div className="card p-6 text-center text-[13px] text-ink-muted">
          {loading ? 'Entegrasyon durumu yükleniyor…' : 'Yüklenemedi.'}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((it) => (
            <li key={it.platform} className="card card-pad">
              <div className="flex items-start gap-3">
                <PlatformIcon platform={it.platform} size={36} rounded="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14px] font-bold text-ink">{it.name}</p>
                    {it.credentialsSet ? (
                      <Badge tone="success">
                        <Icon name="check-circle" size={11} /> Kimlik tanımlı · OAuth hazır
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Kimlik yok</Badge>
                    )}
                  </div>
                  <p className="text-[12px] text-ink-faint">{it.officialApi}</p>
                  <p className="mt-1 text-[12px] text-ink-muted">
                    {INTEGRATION_STATUS_LABELS[it.status as keyof typeof INTEGRATION_STATUS_LABELS] ?? it.status} ·{' '}
                    {it.connectedAccounts} bağlı hesap
                  </p>
                  {it.credentialsSet && (
                    <p className="mt-1 font-mono text-[11.5px] text-ink-faint">
                      {it.credentialsFromWorkspace ? 'Panodan girildi' : 'Ortam değişkeninden'}
                      {it.clientIdMasked ? ` · ${it.clientIdMasked}` : ''}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {it.contentTypes.map((ct: string) => (
                      <span key={ct} className="chip">
                        {CONTENT_TYPE_LABELS[ct] ?? ct}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {canEdit && !it.credentialsSet && (
                      <button className="btn-primary btn-sm" onClick={() => openCredentialModal(it)}>
                        <Icon name="key" size={13} /> Kimlik Gir
                      </button>
                    )}
                    {canEdit && it.credentialsSet && it.credentialsFromWorkspace && (
                      <>
                        <button className="btn-secondary btn-sm" onClick={() => openCredentialModal(it)}>
                          <Icon name="edit" size={13} /> Değiştir
                        </button>
                        <button className="btn-secondary btn-sm text-danger" onClick={() => clearCredentials(it)}>
                          <Icon name="trash" size={13} /> Sil
                        </button>
                      </>
                    )}
                    {it.docsUrl && (
                      <a href={it.docsUrl} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-[12px]">
                        Resmî doküman <Icon name="globe" size={12} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Kimlik girme modalı */}
      {modal && guide && (
        <Modal
          open
          onClose={() => setModal(null)}
          title={`${modal.name} API Kimlikleri`}
          footer={
            <div className="flex justify-end gap-2">
              <button className="btn-secondary btn-md" onClick={() => setModal(null)}>
                Vazgeç
              </button>
              <button className="btn-primary btn-md" onClick={saveCredentials} disabled={saving || !clientId.trim() || !clientSecret.trim()}>
                {saving ? 'Kaydediliyor…' : 'Kimlikleri Kaydet'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="rounded-lg border border-info/30 bg-info/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink">
              {guide.guide}
            </p>
            <div>
              <label className="label">{guide.idLabel}</label>
              <input
                className="input font-mono"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={guide.idLabel}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="label">{guide.secretLabel}</label>
              <div className="relative">
                <input
                  className="input pr-10 font-mono"
                  type={showSecret ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={guide.secretLabel}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                  onClick={() => setShowSecret((v) => !v)}
                  aria-label={showSecret ? 'Gizle' : 'Göster'}
                >
                  <Icon name={showSecret ? 'eye-off' : 'eye'} size={16} />
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface-subtle px-3 py-2.5">
              <p className="text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">OAuth yönlendirme (callback) adresi</p>
              <p className="mt-1 break-all font-mono text-[12px] text-ink">{callbackUrl}</p>
              <p className="mt-1 text-[11.5px] text-ink-faint">Bu adresi API uygulamanızın izinli yönlendirme adreslerine ekleyin.</p>
            </div>
            <p className="flex items-start gap-1.5 text-[11.5px] text-ink-faint">
              <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
              Secret yalnızca şifreli olarak saklanır; kaydedildikten sonra tekrar görüntülenmez.
            </p>
          </div>
        </Modal>
      )}
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
