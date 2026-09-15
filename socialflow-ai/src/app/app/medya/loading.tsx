import { Skeleton } from '@/components/ui/Skeleton';

export default function MediaLoading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8" role="status" aria-live="polite">
      <span className="sr-only">Medya kütüphanesi yükleniyor…</span>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-3 h-3.5 w-72" />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
