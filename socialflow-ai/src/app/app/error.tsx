'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

/**
 * Hata sınırı (§68) — kullanıcıya Türkçe, anlaşılır mesaj; teknik ayrıntı yok.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Teknik ayrıntı yalnızca konsola (sunucuda structured log'a) gider.
    console.error('[app] sayfa hatası', error.digest ?? '', error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
        <Icon name="alert-triangle" size={22} className="text-danger" />
      </div>
      <h1 className="text-lg font-semibold text-ink">Bir şeyler ters gitti</h1>
      <p className="mt-2 text-[13.5px] text-ink-muted">
        Sayfa yüklenirken beklenmeyen bir hata oluştu. Verileriniz kaydedildi; tekrar deneyebilirsiniz.
      </p>
      {error.digest && <p className="mt-2 text-[11.5px] text-ink-faint">Hata kimliği: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button className="btn-primary btn-md" onClick={reset}>
          <Icon name="refresh" size={15} /> Tekrar Dene
        </button>
        <Link className="btn-secondary btn-md" href="/app/dashboard">
          Ana Sayfa
        </Link>
      </div>
    </div>
  );
}
