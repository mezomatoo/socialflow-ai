'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, ProgressBar, Badge } from '@/components/ui';
import { LOCK_MODE_LABELS, type LockMode } from '@/lib/brandkit/constants';

interface HubItem {
  brandId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  hasKit: boolean;
  kit: {
    id: string;
    status: string;
    completenessScore: number;
    lockMode: string;
    currentVersion: number;
    updatedAt: string;
  } | null;
}

function scoreTone(score: number): 'danger' | 'warning' | 'success' {
  if (score >= 80) return 'success';
  if (score >= 45) return 'warning';
  return 'danger';
}

export function BrandKitHub({ items, demoMode }: { items: HubItem[]; demoMode: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Marka Kiti</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
          Her markanın kimliği, görsel kuralları, mesajları ve AI yönergeleri için merkezi doğruluk kaynağı.
          Tüm AI ve kreatif modülleri seçili markanın kitinden beslenir.
        </p>
      </div>

      {demoMode ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-line bg-surface-subtle px-3.5 py-2.5 text-[12.5px] text-ink-muted">
          <Icon name="info" size={15} />
          Demo Modu — gerçek sosyal medya paylaşımı yapılmadı.
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="card p-6">
          <EmptyState
            icon="brand"
            title="Henüz marka yok"
            description="Marka kiti oluşturmak için önce bir marka profili ekleyin."
            action={
              <Link href="/marka-profilleri" className="btn-primary btn-md inline-flex">
                <Icon name="plus" size={15} /> Marka Profilleri
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((b) => {
            const score = b.kit?.completenessScore ?? 0;
            return (
              <li key={b.brandId}>
                <Link
                  href={`/marka-kiti/${b.brandId}`}
                  className="card card-hover flex h-full flex-col overflow-hidden no-underline"
                >
                  <div className="h-1.5 w-full" style={{ background: b.primaryColor }} />
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line"
                        style={{ background: `color-mix(in srgb, ${b.primaryColor} 12%, white)` }}
                      >
                        {b.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.logoUrl} alt={b.name} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-[15px] font-extrabold" style={{ color: b.primaryColor }}>
                            {b.name.charAt(0)}
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold text-ink">{b.name}</p>
                        <p className="truncate text-[12px] text-ink-faint">@{b.slug}</p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-[12px]">
                        <span className="font-semibold text-ink-muted">Doluluk</span>
                        <span className="font-bold text-ink">%{score}</span>
                      </div>
                      <ProgressBar value={score} max={100} tone={scoreTone(score)} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">
                        <Icon name="layers" size={11} /> v{b.kit?.currentVersion ?? 1}
                      </Badge>
                      {b.kit?.lockMode && b.kit.lockMode !== 'OFF' ? (
                        <Badge tone="warning">
                          <Icon name="shield" size={11} /> {LOCK_MODE_LABELS[b.kit.lockMode as LockMode]}
                        </Badge>
                      ) : null}
                      <span className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-600">
                        Aç <Icon name="send" size={13} />
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
