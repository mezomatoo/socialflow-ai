/**
 * İskelet (skeleton) yükleme durumları (§27)
 * Sayfa verisi gelene kadar düzeni korur; "boş ekran" yerine içerik şekli
 * gösterilir. Tümü `aria-hidden` ve `role="status"` ile erişilebilir.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card card-pad">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-4 h-7 w-14" />
          <Skeleton className="mt-3 h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-line" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-4">
          <Skeleton className="h-11 w-11 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

/** Sayfa düzeyi yükleme — bölüm başlığı + kartlar + liste. */
export function PageSkeleton({ title = 'Yükleniyor…' }: { title?: string }) {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8" role="status" aria-live="polite">
      <span className="sr-only">{title}</span>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-3 h-3.5 w-72" />
      <div className="mt-6">
        <SkeletonStatRow />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <div className="border-b border-line px-5 py-4">
            <Skeleton className="h-4 w-40" />
          </div>
          <SkeletonList />
        </div>
        <div className="card p-5">
          <Skeleton className="h-4 w-32" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
