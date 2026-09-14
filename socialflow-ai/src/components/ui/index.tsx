'use client';

import React, { useEffect, useId, useRef } from 'react';
import { Icon } from './Icon';
import { clsx } from 'clsx';

/* ---------------------------------------------------------------- Spinner */
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={clsx('animate-spin', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.6" fill="none" opacity="0.22" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Badge */
const TONES = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  neutral: 'badge-neutral',
  brand: 'badge'
} as const;

export function Badge({
  tone = 'neutral',
  children,
  className = '',
  style
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={clsx(TONES[tone], className)} style={tone === 'brand' ? { background: 'var(--brand-100)', color: 'var(--brand-700)' } : style}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Modal */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md'
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-pop animate-slide-up sm:rounded-2xl',
          widths[size]
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-bold tracking-tight text-ink">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="btn-icon h-8 w-8" aria-label="Kapat">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5">{footer}</footer> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Tabs */
export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
  dotColor?: string;
}

export function Tabs({
  items,
  value,
  onChange,
  className = '',
  variant = 'pill'
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'pill' | 'underline';
}) {
  return (
    <div
      role="tablist"
      className={clsx(
        variant === 'pill'
          ? 'no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-surface-sunken p-1'
          : 'no-scrollbar flex gap-1 overflow-x-auto border-b border-line',
        className
      )}
    >
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            disabled={t.disabled}
            type="button"
            onClick={() => onChange(t.id)}
            className={clsx(
              'relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] font-semibold transition-all disabled:opacity-40',
              variant === 'pill'
                ? clsx('rounded-lg px-3 py-1.5', active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink')
                : clsx('px-3 py-2.5', active ? 'text-ink' : 'text-ink-muted hover:text-ink')
            )}
          >
            {t.icon}
            {t.dotColor ? <span className="h-2 w-2 rounded-full" style={{ background: t.dotColor }} /> : null}
            {t.label}
            {typeof t.count === 'number' ? (
              <span className={clsx('rounded-full px-1.5 py-0.5 text-[10.5px] font-bold', active ? 'bg-brand-100 text-brand-700' : 'bg-surface-sunken text-ink-faint')}>
                {t.count}
              </span>
            ) : null}
            {variant === 'underline' && active ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full" style={{ background: 'var(--brand-600)' }} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- Switch */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  hint
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40',
          checked ? '' : 'bg-slate-300'
        )}
        style={checked ? { background: 'var(--brand-600)' } : undefined}
      >
        <span
          className={clsx(
            'absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
          )}
        />
      </button>
      {label ? (
        <label htmlFor={id} className="cursor-pointer select-none">
          <span className="block text-[13px] font-semibold text-ink">{label}</span>
          {hint ? <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{hint}</span> : null}
        </label>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Checkbox */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  indeterminate,
  className = ''
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  indeterminate?: boolean;
  className?: string;
}) {
  return (
    <label className={clsx('inline-flex cursor-pointer select-none items-center gap-2', disabled && 'cursor-not-allowed opacity-50', className)}>
      <span
        className={clsx(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all',
          checked || indeterminate ? 'border-transparent text-white' : 'border-slate-300 bg-surface'
        )}
        style={checked || indeterminate ? { background: 'var(--brand-600)' } : undefined}
      >
        {indeterminate ? (
          <span className="h-[2px] w-[9px] rounded bg-white" />
        ) : checked ? (
          <Icon name="check" size={12} strokeWidth={3} />
        ) : null}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label ? <span className="text-[13px] font-medium text-ink">{label}</span> : null}
    </label>
  );
}

/* ---------------------------------------------------------- Progress bar */
export function ProgressBar({
  value,
  max,
  tone = 'brand',
  className = ''
}: {
  value: number;
  max: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const colors = {
    brand: 'var(--brand-600)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)'
  };
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken', className)}>
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: colors[tone] }} />
    </div>
  );
}

/* ------------------------------------------------------------- EmptyState */
export function EmptyState({
  icon = 'info',
  title,
  description,
  action
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface-subtle/60 px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-ink-faint shadow-sm">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-[14px] font-bold text-ink">{title}</p>
      {description ? <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- Tooltip */
export function Tooltip({ label, children, side = 'top' }: { label: string; children: React.ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={clsx(
          'pointer-events-none absolute left-1/2 z-50 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11.5px] font-medium text-white shadow-lg group-hover:block',
          side === 'top' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'
        )}
      >
        {label}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------ Segmented */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = ''
}: {
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={clsx('inline-flex rounded-lg border border-line bg-surface p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-[6px] font-semibold transition-all',
            size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
            o.value === value ? 'text-white shadow-sm' : 'text-ink-muted hover:text-ink'
          )}
          style={o.value === value ? { background: 'var(--brand-600)' } : undefined}
          aria-pressed={o.value === value}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- CardHeader */
export function CardHeader({
  title,
  subtitle,
  action,
  icon
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line px-5 py-4">
      {icon ? (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h3 className="section-title">{title}</h3>
        {subtitle ? <p className="section-sub">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------- StatusPill */
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: keyof typeof TONES; label: string; icon: string }> = {
    DRAFT: { tone: 'neutral', label: 'Taslak', icon: 'draft' },
    SCHEDULED: { tone: 'info', label: 'Planlandı', icon: 'clock' },
    PUBLISHING: { tone: 'warning', label: 'Yayınlanıyor', icon: 'refresh' },
    PUBLISHED: { tone: 'success', label: 'Yayınlandı', icon: 'check-circle' },
    PARTIALLY_PUBLISHED: { tone: 'warning', label: 'Kısmen Yayınlandı', icon: 'alert-triangle' },
    PARTIAL: { tone: 'warning', label: 'Kısmen Yayınlandı', icon: 'alert-triangle' },
    FAILED: { tone: 'danger', label: 'Hata', icon: 'x-circle' },
    APPROVAL_PENDING: { tone: 'warning', label: 'Onay Bekliyor', icon: 'shield' },
    CANCELLED: { tone: 'neutral', label: 'İptal Edildi', icon: 'x-circle' }
  };
  const s = map[status] ?? { tone: 'neutral' as const, label: status, icon: 'info' };
  return (
    <Badge tone={s.tone}>
      <Icon name={s.icon} size={11} strokeWidth={2.4} />
      {s.label}
    </Badge>
  );
}
