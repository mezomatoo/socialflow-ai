'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';

/**
 * Uygulama içi bildirim (toast) sistemi — tüm mesajlar Türkçe.
 */

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => string;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast, ToastProvider içinde kullanılmalıdır.');
  return ctx;
}

const KIND_STYLE: Record<ToastKind, { bg: string; icon: string; name: Parameters<typeof Icon>[0]['name'] }> = {
  success: { bg: 'var(--success)', icon: '#065f46', name: 'check-circle' },
  error: { bg: 'var(--danger)', icon: '#7f1d1d', name: 'x-circle' },
  warning: { bg: 'var(--warning)', icon: '#78350f', name: 'alert-triangle' },
  info: { bg: 'var(--info)', icon: '#075985', name: 'info' }
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [...prev.slice(-4), { ...t, id }]);
      return id;
    },
    []
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, message) => toast({ kind: 'success', title, message }),
      error: (title, message) => toast({ kind: 'error', title, message }),
      warning: (title, message) => toast({ kind: 'warning', title, message }),
      info: (title, message) => toast({ kind: 'info', title, message })
    }),
    [toast, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
        role="region"
        aria-live="polite"
        aria-label="Bildirimler"
      >
        {items.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const style = KIND_STYLE[toast.kind];
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const duration = toast.duration ?? (toast.kind === 'error' ? 8000 : 5000);
    const t = setTimeout(() => {
      setLeaving(true);
      setTimeout(onDismiss, 200);
    }, duration);
    return () => clearTimeout(t);
  }, [toast.duration, toast.kind, onDismiss]);

  return (
    <div
      className={`pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl border border-line bg-surface shadow-pop transition-all duration-200 ${
        leaving ? 'translate-y-2 opacity-0' : 'animate-slide-up'
      }`}
      role="status"
    >
      <div className="flex gap-3 p-3.5">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${style.bg}1f`, color: style.icon }}
        >
          <Icon name={style.name} size={16} strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold leading-snug text-ink">{toast.title}</p>
          {toast.message ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{toast.message}</p> : null}
          {toast.action ? (
            <button
              type="button"
              className="mt-2 text-[12.5px] font-bold text-brand-600 hover:underline"
              onClick={() => {
                toast.action?.onClick();
                onDismiss();
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 -mt-1 h-7 w-7 shrink-0 rounded-lg text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
          aria-label="Bildirimi kapat"
        >
          <Icon name="x" size={15} className="mx-auto" />
        </button>
      </div>
      <div className="h-0.5 w-full" style={{ background: style.bg, opacity: 0.55 }} />
    </div>
  );
}
