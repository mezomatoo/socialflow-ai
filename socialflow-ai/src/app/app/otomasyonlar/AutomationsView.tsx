'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Spinner, Switch } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api } from '@/lib/client/api';
import {
  TRIGGER_LABELS,
  ACTION_LABELS,
  AUTONOMY_LABELS,
  CONDITION_OPERATOR_LABELS,
  type AutomationRuleDTO,
  type AutomationTrigger,
  type AutomationAction
} from '@/lib/automation/labels';

/**
 * Otomasyonlar görünümü — GERÇEK /api/v1/automations uçlarını kullanır.
 * ---------------------------------------------------------------------------
 * - Kurallar ve yürütmeler veritabanı kaydıdır; mock veri YOKTUR.
 * - Özerklik düzeyi 1 (Sadece Öneri) yalnızca bildirim üretir (§100).
 * - Otomatik yayın motor düzeyinde kapalıdır; arayüz bunu dürüstçe belirtir (§101).
 * - Döngü koruması sunucuda çalışır; başarısız/atlanan yürütmeler görünürdür (§124).
 */

type RuleExecution = {
  id: string;
  ruleId: string;
  trigger: string;
  triggerId: string | null;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
  output: { results?: { type: string; executed: boolean; detail: string }[] } | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

const TRIGGER_OPTIONS = Object.entries(TRIGGER_LABELS) as [AutomationTrigger, string][];
const ACTION_OPTIONS = Object.entries(ACTION_LABELS) as [AutomationAction['type'], string][];
const OPERATOR_OPTIONS = Object.entries(CONDITION_OPERATOR_LABELS) as ['eq' | 'neq' | 'contains', string][];

const STATUS_TONES: Record<RuleExecution['status'], 'success' | 'danger' | 'warning' | 'neutral' | 'brand'> = {
  DONE: 'success',
  FAILED: 'danger',
  SKIPPED: 'warning',
  RUNNING: 'brand',
  QUEUED: 'neutral'
};

const STATUS_LABELS: Record<RuleExecution['status'], string> = {
  DONE: 'Tamamlandı',
  FAILED: 'Başarısız',
  SKIPPED: 'Atlandı',
  RUNNING: 'Çalışıyor',
  QUEUED: 'Sırada'
};

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AutomationsView({ demoMode }: { demoMode: boolean }) {
  const toast = useToast();
  const [rules, setRules] = useState<AutomationRuleDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [executions, setExecutions] = useState<RuleExecution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Yeni kural formu
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<AutomationTrigger>('ContentCreated');
  const [autonomyLevel, setAutonomyLevel] = useState<1 | 2 | 3 | 4>(1);
  const [conditions, setConditions] = useState<{ field: string; operator: 'eq' | 'neq' | 'contains'; value: string }[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [createDraft, setCreateDraft] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = rules.find((r) => r.id === selectedId) ?? null;

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items: AutomationRuleDTO[] }>('/api/automations');
      setRules(data.items);
      setSelectedId((prev) => prev ?? data.items[0]?.id ?? null);
    } catch (err) {
      toast.error('Kurallar yüklenemedi', err instanceof Error ? err.message : 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const loadExecutions = useCallback(async (ruleId: string) => {
    setExecutionsLoading(true);
    try {
      const data = await api.get<{ items: RuleExecution[] }>(`/api/automations/${ruleId}/executions`);
      setExecutions(data.items);
    } catch {
      setExecutions([]);
    } finally {
      setExecutionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadExecutions(selectedId);
    else setExecutions([]);
  }, [selectedId, loadExecutions]);

  function resetForm() {
    setName('');
    setTrigger('ContentCreated');
    setAutonomyLevel(1);
    setConditions([]);
    setActions([]);
    setNotifTitle('');
    setNotifMessage('');
    setTaskTitle('');
    setCreateDraft(false);
  }

  function buildActions(): AutomationAction[] {
    const built: AutomationAction[] = [];
    if (notifTitle.trim()) {
      built.push({ type: 'send_notification', payload: { title: notifTitle.trim(), message: notifMessage.trim() || notifTitle.trim() } });
    }
    if (taskTitle.trim()) {
      built.push({ type: 'create_task', payload: { title: taskTitle.trim() } });
    }
    if (createDraft) {
      built.push({ type: 'generate_content_draft' });
    }
    return built;
  }

  async function handleCreate() {
    const builtActions = buildActions();
    if (!name.trim()) {
      toast.error('Kural adı gerekli', 'Kurala anlaşılır bir ad verin.');
      return;
    }
    if (builtActions.length === 0) {
      toast.error('En az bir aksiyon seçin', 'Bildirim, görev veya taslak oluşturma aksiyonlarından birini ekleyin.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post<{ rule: AutomationRuleDTO }>('/api/automations', {
        name: name.trim(),
        trigger,
        conditions: conditions.filter((c) => c.field.trim() && c.value.trim()),
        actions: builtActions,
        autonomyLevel,
        enabled: true
      });
      toast.success('Kural oluşturuldu', `${data.rule.name} artık çalışıyor.`);
      setShowForm(false);
      resetForm();
      await loadRules();
      setSelectedId(data.rule.id);
    } catch (err) {
      toast.error('Kural oluşturulamadı', err instanceof Error ? err.message : 'Bilinmeyen hata');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(rule: AutomationRuleDTO) {
    try {
      await api.patch<{ rule: AutomationRuleDTO }>(`/api/automations/${rule.id}`, { enabled: !rule.enabled });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !rule.enabled } : r)));
      toast.success(rule.enabled ? 'Kural kapatıldı' : 'Kural açıldı');
    } catch (err) {
      toast.error('Kural güncellenemedi', err instanceof Error ? err.message : 'Bilinmeyen hata');
    }
  }

  async function handleDelete(rule: AutomationRuleDTO) {
    if (!window.confirm(`"${rule.name}" kuralı silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      await api.del(`/api/automations/${rule.id}`);
      toast.success('Kural silindi');
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      if (selectedId === rule.id) setSelectedId(null);
    } catch (err) {
      toast.error('Kural silinemedi', err instanceof Error ? err.message : 'Bilinmeyen hata');
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Otomasyonlar</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
          EĞER tetikleyici VE koşullar O ZAMAN eylemler. Varsayılan seviye <strong>Seviye 1 — Sadece Öneri</strong>.
          AI asla sessizce yayınlamaz, onaylamaz veya silmez.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {demoMode ? <Badge tone="warning">Demo Modu</Badge> : null}
          <Badge tone="brand">Döngü koruması aktif</Badge>
        </div>
        <div className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-[12.5px] leading-relaxed text-ink">
          <strong>Güvenlik:</strong> Otomatik yayın motor düzeyinde kapalıdır; “Onaylı içeriği planla” aksiyonu yalnızca
          dürüst gerekçeyle SKIPPED kaydı üretir. Her yürütme denetlenebilir; başarısız yürütmeler gizlenmez.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <div className="card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="section-title">Kurallar</h3>
              <button className="btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
                <Icon name="plus" size={13} /> {showForm ? 'Formu Kapat' : 'Yeni Kural'}
              </button>
            </div>

            {showForm ? (
              <div className="mb-3 space-y-2.5 rounded-xl border border-line bg-surface-subtle p-3">
                <div>
                  <label className="label" htmlFor="rule-name">Kural adı</label>
                  <input
                    id="rule-name"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Örn. Yeni taslakta bana haber ver"
                    maxLength={80}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="rule-trigger">EĞER (tetikleyici)</label>
                  <select id="rule-trigger" className="input" value={trigger} onChange={(e) => setTrigger(e.target.value as AutomationTrigger)}>
                    {TRIGGER_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="label">VE (koşullar — opsiyonel)</p>
                  {conditions.map((c, i) => (
                    <div key={i} className="mt-1 flex items-center gap-1">
                      <input
                        className="input flex-1"
                        value={c.field}
                        placeholder="alan (ör. status)"
                        onChange={(e) => setConditions((prev) => prev.map((x, xi) => (xi === i ? { ...x, field: e.target.value } : x)))}
                      />
                      <select
                        className="input w-[110px]"
                        value={c.operator}
                        onChange={(e) => setConditions((prev) => prev.map((x, xi) => (xi === i ? { ...x, operator: e.target.value as 'eq' | 'neq' | 'contains' } : x)))}
                      >
                        {OPERATOR_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <input
                        className="input flex-1"
                        value={c.value}
                        placeholder="değer"
                        onChange={(e) => setConditions((prev) => prev.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x)))}
                      />
                      <button className="btn-icon" aria-label="Koşulu kaldır" onClick={() => setConditions((prev) => prev.filter((_, xi) => xi !== i))}>
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn-secondary btn-sm mt-1.5"
                    onClick={() => setConditions((prev) => [...prev, { field: '', operator: 'eq', value: '' }])}
                  >
                    <Icon name="plus" size={12} /> Koşul ekle
                  </button>
                </div>
                <div>
                  <p className="label">O ZAMAN (aksiyonlar)</p>
                  <div className="space-y-1.5">
                    <input className="input" value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} placeholder="Bildirim başlığı (opsiyonel)" maxLength={100} />
                    {notifTitle.trim() ? (
                      <input className="input" value={notifMessage} onChange={(e) => setNotifMessage(e.target.value)} placeholder="Bildirim mesajı" maxLength={200} />
                    ) : null}
                    <input className="input" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Görev başlığı (opsiyonel)" maxLength={100} />
                    <label className="flex items-center gap-2 text-[12.5px]">
                      <Switch checked={createDraft} onChange={setCreateDraft} /> Taslak içerik oluştur (Seviye 2+)
                    </label>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="rule-autonomy">Özerklik düzeyi</label>
                  <select
                    id="rule-autonomy"
                    className="input"
                    value={autonomyLevel}
                    onChange={(e) => setAutonomyLevel(Number(e.target.value) as 1 | 2 | 3 | 4)}
                  >
                    {([1, 2, 3, 4] as const).map((level) => (
                      <option key={level} value={level}>Seviye {level} — {AUTONOMY_LABELS[level]}</option>
                    ))}
                  </select>
                  <p className="hint mt-1">Seviye 1 yalnızca öneri bildirimi üretir; aksiyon çalıştırmaz.</p>
                </div>
                <button className="btn-primary btn-md w-full" disabled={busy} onClick={() => void handleCreate()}>
                  {busy ? <Spinner size={14} /> : null} Kuralı Oluştur
                </button>
              </div>
            ) : null}

            {loading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : rules.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-ink-muted">Henüz kural yok. “Yeni Kural” ile ilk kuralınızı oluşturun.</p>
            ) : (
              <ul className="space-y-2">
                {rules.map((r) => (
                  <li
                    key={r.id}
                    className={`rounded-xl border p-3 ${selectedId === r.id ? 'border-brand-300 bg-brand-50/50' : 'border-line bg-surface hover:bg-surface-subtle'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => setSelectedId(r.id)} className="text-left">
                        <p className="text-[13.5px] font-bold">{r.name}</p>
                        <p className="text-[11.5px] text-ink-muted">
                          EĞER {TRIGGER_LABELS[r.trigger]} → {r.actions.map((a) => ACTION_LABELS[a.type]).join(', ')}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-faint">Seviye {r.autonomyLevel} — {AUTONOMY_LABELS[r.autonomyLevel]}</p>
                      </button>
                      <Switch checked={r.enabled} onChange={() => void handleToggle(r)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {selected ? (
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-bold">{selected.name}</h2>
                  <p className="mt-1 text-[12.5px] text-ink-muted">
                    Tetikleyici: <Badge tone="brand">{TRIGGER_LABELS[selected.trigger]}</Badge> • Seviye {selected.autonomyLevel} — {AUTONOMY_LABELS[selected.autonomyLevel]}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={selected.enabled ? 'success' : 'neutral'}>{selected.enabled ? 'Etkin' : 'Devre Dışı'}</Badge>
                  <button className="btn-icon" aria-label="Kuralı sil" onClick={() => void handleDelete(selected)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="label">EĞER</p>
                  <p className="rounded-lg border border-line bg-surface-subtle p-3 text-[13px]">{TRIGGER_LABELS[selected.trigger]}</p>
                </div>
                <div>
                  <p className="label">VE (koşullar)</p>
                  {selected.conditions.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {selected.conditions.map((c, i) => (
                        <li key={i} className="chip">
                          {c.field} {CONDITION_OPERATOR_LABELS[c.operator]} “{c.value}”
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint">Koşul yok (her eşleşmede çalışır).</p>
                  )}
                </div>
                <div>
                  <p className="label">O ZAMAN (aksiyonlar)</p>
                  <ul className="space-y-1.5">
                    {selected.actions.map((a, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-lg border border-line p-2.5 text-[13px]">
                        <Icon name="zap" size={14} className="text-brand-600" /> {ACTION_LABELS[a.type] ?? a.type}
                        {a.type === 'schedule_approved_content' ? <span className="ml-auto text-[11px] text-warning">Motor düzeyinde kapalı (§101)</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-line bg-surface-subtle p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-semibold">Son Yürütmeler</p>
                  <button className="btn-secondary btn-sm" onClick={() => void loadExecutions(selected.id)}>
                    Yenile
                  </button>
                </div>
                {executionsLoading ? (
                  <div className="flex justify-center py-4"><Spinner /></div>
                ) : executions.length === 0 ? (
                  <p className="mt-2 text-[12.5px] text-ink-muted">Bu kural henüz çalışmadı. Tetikleyici gerçekleştiğinde yürütmeler burada listelenir.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {executions.map((e) => (
                      <li key={e.id} className="rounded-lg border border-line bg-surface p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] text-ink-muted">{formatTime(e.createdAt)}</span>
                          <Badge tone={STATUS_TONES[e.status]}>{STATUS_LABELS[e.status]}</Badge>
                        </div>
                        {e.error ? <p className="mt-1 text-[11.5px] text-ink-muted">{e.error}</p> : null}
                        {e.output?.results?.length ? (
                          <ul className="mt-1 space-y-0.5">
                            {e.output.results.map((r, i) => (
                              <li key={i} className="text-[11.5px] text-ink-muted">
                                • {ACTION_LABELS[r.type as AutomationAction['type']] ?? r.type}: {r.executed ? 'çalıştı' : 'çalışmadı'} — {r.detail}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="card p-10 text-center text-ink-muted">
              {loading ? <Spinner /> : 'Bir kural seçin veya yeni kural oluşturun.'}
            </div>
          )}

          <div className="card p-4">
            <h3 className="section-title">Otomatik Yayın Durumu</h3>
            <p className="hint">
              Otomatik yayın güvenlik nedeniyle tüm kurulumda kapalıdır. İçerikler yalnızca onay akışından geçerek
              zamanlanır; otomasyon kuralları bildirim, görev ve taslak üretebilir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
