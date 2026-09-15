'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, EmptyState, Modal, Switch, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import type { CollectionDef, FieldDef } from '@/lib/brandkit/collections';
import { APPROVAL_STATUS_LABELS, type ApprovalStatus } from '@/lib/brandkit/constants';

type Row = Record<string, any>;

function parseTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

const TITLE_FIELDS = ['name', 'text', 'title', 'tag', 'handle', 'key', 'summary', 'fontFamily'];

function rowTitle(def: CollectionDef, row: Row): string {
  for (const f of TITLE_FIELDS) {
    if (def.fields.some((x) => x.name === f) && row[f]) return String(row[f]);
  }
  const firstStr = def.fields.find((f) => f.type === 'string' || f.type === 'text' || f.type === 'select');
  return firstStr && row[firstStr.name] ? String(row[firstStr.name]) : 'Kayıt';
}

function approvalTone(s: string): 'neutral' | 'warning' | 'success' | 'info' {
  if (s === 'APPROVED') return 'success';
  if (s === 'PENDING_APPROVAL') return 'warning';
  if (s === 'ARCHIVED') return 'info';
  return 'neutral';
}

export function CollectionPanel({
  brandId,
  def,
  items,
  canEdit,
  onChanged,
  filter,
  preset
}: {
  brandId: string;
  def: CollectionDef;
  items: Row[];
  canEdit: boolean;
  onChanged: () => void;
  filter?: (row: Row) => boolean;
  preset?: Row;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = filter ? items.filter(filter) : items;

  function blankForm(): Row {
    const f: Row = {};
    for (const field of def.fields) {
      f[field.name] =
        field.default !== undefined
          ? field.default
          : field.type === 'boolean'
            ? false
            : field.type === 'tags'
              ? ''
              : '';
    }
    if (preset) Object.assign(f, preset);
    return f;
  }

  function editForm(row: Row): Row {
    const f: Row = {};
    for (const field of def.fields) {
      const v = row[field.name];
      if (field.type === 'tags') f[field.name] = parseTags(v).join(', ');
      else if (field.type === 'boolean') f[field.name] = !!v;
      else if (field.type === 'int') f[field.name] = v ?? '';
      else f[field.name] = v ?? '';
    }
    return f;
  }

  function startAdd() {
    setEditing(null);
    setForm(blankForm());
    setOpen(true);
  }
  function startEdit(row: Row) {
    setEditing(row);
    setForm(editForm(row));
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const base = `/api/brands/${brandId}/marka-kiti/c/${def.key}`;
      if (editing?.id) await api.patch(`${base}/${editing.id}`, form);
      else await api.post(base, form);
      toast.success(editing ? 'Güncellendi' : 'Eklendi', `${def.label} kaydedildi.`);
      setOpen(false);
      onChanged();
    } catch (e) {
      toast.error('Kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Row) {
    if (!window.confirm(`"${rowTitle(def, row)}" silinsin mi?`)) return;
    setBusyId(row.id);
    try {
      await api.del(`/api/brands/${brandId}/marka-kiti/c/${def.key}/${row.id}`);
      toast.success('Silindi', `${def.label} kaldırıldı.`);
      onChanged();
    } catch (e) {
      toast.error('Silinemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusyId(null);
    }
  }

  const summaryFields = def.fields.filter(
    (f) => !['order', 'approvalStatus'].includes(f.name) && f.name !== TITLE_FIELDS.find((t) => def.fields.some((x) => x.name === t))
  ).slice(0, 3);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-ink-muted">
          {rows.length} {def.labelPlural.toLowerCase()} kaydı.
        </p>
        {canEdit ? (
          <button className="btn-primary btn-sm" onClick={startAdd}>
            <Icon name="plus" size={15} /> {def.label} Ekle
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={def.icon}
          title={`${def.labelPlural} boş`}
          description={canEdit ? `İlk ${def.label.toLowerCase()} kaydını ekleyin.` : 'Düzenleme yetkiniz yok.'}
          action={canEdit ? <button className="btn-primary btn-md" onClick={startAdd}><Icon name="plus" size={15} /> Ekle</button> : undefined}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id} className="card p-3.5">
              <div className="flex items-start gap-3">
                {def.fields.some((f) => f.name === 'hex') ? (
                  <span className="mt-0.5 h-9 w-9 shrink-0 rounded-lg border border-line" style={{ background: row.hex || '#eee' }} />
                ) : (
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-faint">
                    <Icon name={def.icon} size={16} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[14px] font-bold text-ink">{rowTitle(def, row)}</p>
                    <Badge tone={approvalTone(row.approvalStatus)}>
                      {APPROVAL_STATUS_LABELS[(row.approvalStatus as ApprovalStatus) ?? 'DRAFT']}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-muted">
                    {summaryFields.map((f) => {
                      let val: string;
                      if (f.type === 'tags') val = parseTags(row[f.name]).join(', ');
                      else if (f.type === 'boolean') val = row[f.name] ? 'Evet' : '—';
                      else if (f.type === 'select') val = f.options?.find((o) => o.value === row[f.name])?.label ?? String(row[f.name] ?? '');
                      else val = String(row[f.name] ?? '');
                      if (!val || val === '—') return null;
                      return (
                        <span key={f.name} className="truncate">
                          <span className="text-ink-faint">{f.label}:</span> {val}
                        </span>
                      );
                    })}
                  </div>
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button className="btn-icon h-8 w-8" onClick={() => startEdit(row)} aria-label="Düzenle">
                      <Icon name="edit" size={15} />
                    </button>
                    <button className="btn-icon h-8 w-8" disabled={busyId === row.id} onClick={() => remove(row)} aria-label="Sil">
                      {busyId === row.id ? <Spinner size={14} /> : <Icon name="trash" size={15} />}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `${def.label} Düzenle` : `Yeni ${def.label}`}
        size="lg"
        footer={
          <>
            <button className="btn-ghost btn-md" onClick={() => setOpen(false)} disabled={saving}>
              Vazgeç
            </button>
            <button className="btn-primary btn-md" onClick={save} disabled={saving}>
              {saving ? <Spinner size={15} /> : <Icon name="save" size={15} />} Kaydet
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {def.fields.map((field) => (
            <FieldInput key={field.name} field={field} value={form[field.name]} onChange={(v) => setForm((p) => ({ ...p, [field.name]: v }))} />
          ))}
        </div>
      </Modal>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FieldDef; value: any; onChange: (v: any) => void }) {
  const wide = field.type === 'text' || field.type === 'tags';
  const wrap = (input: React.ReactNode) => (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="mb-1 block text-[12.5px] font-semibold text-ink">
        {field.label}
        {field.required ? <span className="text-danger"> *</span> : null}
      </label>
      {input}
      {field.hint ? <p className="mt-1 text-[11.5px] text-ink-faint">{field.hint}</p> : null}
    </div>
  );

  if (field.type === 'boolean') {
    return (
      <div className={wide ? 'sm:col-span-2' : ''}>
        <Switch checked={!!value} onChange={onChange} label={field.label} hint={field.hint} />
      </div>
    );
  }
  if (field.type === 'select') {
    return wrap(
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {!field.required && !field.options?.some((o) => o.value === '') ? <option value="">—</option> : null}
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'text') {
    return wrap(<textarea className="input min-h-[80px] resize-y" value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />);
  }
  if (field.type === 'tags') {
    return wrap(
      <>
        <input className="input" value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
        <p className="mt-1 text-[11.5px] text-ink-faint">Virgülle ayırın.</p>
      </>
    );
  }
  if (field.type === 'int') {
    return wrap(<input className="input" type="number" value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />);
  }
  if (field.type === 'color') {
    return wrap(
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface"
          value={/^#[0-9a-fA-F]{6}$/.test(String(value ?? '')) ? String(value) : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <input className="input" value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  return wrap(<input className="input" value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />);
}
