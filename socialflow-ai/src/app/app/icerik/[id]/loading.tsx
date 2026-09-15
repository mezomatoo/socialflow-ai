import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';

/** Kompozisyon ekranı iskeleti (§27) — düzen kaymaz, içerik şekli korunur. */
export default function ComposerLoading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8" role="status" aria-live="polite">
      <span className="sr-only">İçerik düzenleyici yükleniyor…</span>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-3.5 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-field" />
          <Skeleton className="h-9 w-40 rounded-field" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[400px_1fr]">
        <aside className="card p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-48 w-full rounded-field" />
          <Skeleton className="mt-3 h-3 w-24" />
        </aside>
        <div className="card">
          <div className="border-b border-line px-5 py-4">
            <Skeleton className="h-4 w-40" />
          </div>
          <SkeletonList rows={3} />
        </div>
      </div>
    </div>
  );
}
