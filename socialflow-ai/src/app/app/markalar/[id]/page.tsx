import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui';
import { CONTENT_STYLE_LABELS } from '@/lib/platforms/platforms';
import { isModuleEnabled } from '@/lib/phase/phaseGates';

export const dynamic = 'force-dynamic';

/**
 * Marka detayı (§17)
 * ---------------------------------------------------------------------------
 * Marka profili ve MARKA SESİ Faz 1'in çekirdeğidir: üretilen her metin bu
 * kurallara göre şekillenir (ton, yasaklı/zorunlu terimler, zorunlu hashtag).
 * Bu ekran, içerik üretiminde gerçekten kullanılan kuralları görünür kılar ve
 * markanın içerik/medya varlıklarını özetler. Düzenleme, Markalar listesindeki
 * forma yapılır (tek yerden yönetim).
 */
export default async function BrandDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/giris');
  const workspaceId = session.user.workspaceId;

  const brand = await prisma.brand.findFirst({
    where: { id: params.id, workspaceId },
    include: {
      voice: true,
      _count: { select: { contents: true, socialAccounts: true, mediaAssets: true } }
    }
  });
  // Çalışma alanı izolasyonu: başka çalışma alanının markası görünmez (§14).
  if (!brand) notFound();

  const [recentContents, statusCounts] = await Promise.all([
    prisma.content.findMany({
      where: { workspaceId, brandId: brand.id },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: { id: true, title: true, status: true, updatedAt: true, _count: { select: { platformContents: true } } }
    }),
    prisma.content.groupBy({ by: ['status'], where: { workspaceId, brandId: brand.id }, _count: { _all: true } })
  ]);

  const split = (value: string | null | undefined) =>
    (value ?? '')
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const voice = brand.voice;
  const accountsEnabled = isModuleEnabled('socialAccounts');

  const voiceRows: { label: string; value: string; hint?: string }[] = [
    { label: 'Ton', value: voice?.tone || 'Tanımlanmadı', hint: 'Metinlerin genel üslubu' },
    { label: 'Kişilik', value: voice?.personality || 'Tanımlanmadı' },
    { label: 'Hedef kitle', value: voice?.audience || brand.targetAudience || 'Tanımlanmadı' },
    {
      label: 'Resmiyet',
      value:
        ({ FORMAL: 'Resmî', NEUTRAL: 'Nötr', CASUAL: 'Samimi' } as Record<string, string>)[voice?.formality ?? ''] ??
        voice?.formality ??
        'Tanımlanmadı'
    },
    {
      label: 'Emoji kullanımı',
      value:
        ({ NONE: 'Kullanılmaz', LOW: 'Az', MEDIUM: 'Orta', HIGH: 'Yoğun' } as Record<string, string>)[
          voice?.emojiLevel ?? ''
        ] ?? voice?.emojiLevel ?? 'Tanımlanmadı'
    },
    { label: 'Varsayılan stil', value: CONTENT_STYLE_LABELS[brand.defaultStyle as keyof typeof CONTENT_STYLE_LABELS] ?? brand.defaultStyle },
    { label: 'Varsayılan eylem çağrısı', value: brand.defaultCta || 'Tanımlanmadı' }
  ];

  const termGroups: { title: string; tone: 'success' | 'danger' | 'info' | 'neutral'; items: string[]; hint: string }[] = [
    {
      title: 'Zorunlu terimler',
      tone: 'success',
      items: split(voice?.mustKeepTerms),
      hint: 'Hiçbir uyarlamada değiştirilmez.'
    },
    { title: 'Kullanılabilir terimler', tone: 'info', items: split(voice?.allowedTerms), hint: 'Ton uyumu için önerilir.' },
    { title: 'Yasaklı terimler', tone: 'danger', items: split(voice?.bannedTerms), hint: 'Metinden otomatik çıkarılır.' }
  ];

  const hashtagGroups: { title: string; items: string[]; tone: 'success' | 'danger' | 'neutral' }[] = [
    { title: 'Zorunlu hashtagler', items: split(brand.requiredHashtags), tone: 'success' },
    { title: 'Varsayılan hashtagler', items: split(brand.defaultHashtags), tone: 'neutral' },
    { title: 'Yasaklı hashtagler', items: split(brand.bannedHashtags), tone: 'danger' }
  ];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      <nav className="mb-4 flex items-center gap-2 text-[12.5px] text-ink-faint" aria-label="Sayfa yolu">
        <Link href="/app/markalar" className="link">
          Markalar
        </Link>
        <Icon name="chevronRight" size={13} />
        <span className="font-semibold text-ink-muted">{brand.name}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-xl text-[15px] font-extrabold text-white"
            style={{ background: brand.primaryColor }}
            aria-hidden="true"
          >
            {brand.name.slice(0, 2).toLocaleUpperCase('tr-TR')}
          </span>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-[22px] font-extrabold tracking-tight text-ink">
              {brand.name}
              {brand.isDefault && <Badge tone="brand">Varsayılan</Badge>}
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {brand.description || 'Açıklama eklenmedi'} · {brand._count.contents} içerik · {brand._count.mediaAssets} medya
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/markalar" className="btn-secondary btn-md">
            <Icon name="settings" size={15} /> Profili Düzenle
          </Link>
          <Link href={`/app/icerik/yeni?marka=${brand.id}`} className="btn-primary btn-md">
            <Icon name="plus" size={15} /> Bu Markayla İçerik
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Marka sesi */}
        <section className="card lg:col-span-2">
          <header className="border-b border-line px-5 py-4">
            <h2 className="section-title">Marka Sesi</h2>
            <p className="section-sub">
              İçerik üretiminde (Platformlara Uyarla) bu kurallar uygulanır; yasaklı terimler metinden çıkarılır, zorunlu
              terimler asla değiştirilmez.
            </p>
          </header>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
            {voiceRows.map((row) => (
              <div key={row.label}>
                <dt className="stat-label">{row.label}</dt>
                <dd className="mt-1 text-[13.5px] font-semibold text-ink">{row.value}</dd>
                {row.hint && <p className="mt-0.5 text-[11.5px] text-ink-faint">{row.hint}</p>}
              </div>
            ))}
          </dl>

          <div className="grid grid-cols-1 gap-4 border-t border-line p-5 sm:grid-cols-3">
            {termGroups.map((g) => (
              <div key={g.title}>
                <p className="stat-label">{g.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.items.length === 0 ? (
                    <span className="text-[12px] text-ink-faint">Tanımlanmadı</span>
                  ) : (
                    g.items.map((t) => (
                      <Badge key={t} tone={g.tone}>
                        {t}
                      </Badge>
                    ))
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-ink-faint">{g.hint}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Hashtagler + medya */}
        <div className="space-y-5">
          <section className="card">
            <header className="border-b border-line px-5 py-4">
              <h2 className="section-title">Hashtag Kuralları</h2>
              <p className="section-sub">Platform sınırlarına göre uygulanır</p>
            </header>
            <div className="space-y-4 p-5">
              {hashtagGroups.map((g) => (
                <div key={g.title}>
                  <p className="stat-label">{g.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.items.length === 0 ? (
                      <span className="text-[12px] text-ink-faint">Tanımlanmadı</span>
                    ) : (
                      g.items.map((h) => (
                        <Badge key={h} tone={g.tone}>
                          #{h.replace(/^#/, '')}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <header className="border-b border-line px-5 py-4">
              <h2 className="section-title">Varlıklar</h2>
            </header>
            <ul className="divide-y divide-line">
              <li className="flex items-center justify-between px-5 py-2.5">
                <span className="text-[12.5px] text-ink-muted">İçerikler</span>
                <Link href="/app/icerik/taslaklar" className="text-[13px] font-bold text-brand-600 hover:underline">
                  {brand._count.contents}
                </Link>
              </li>
              <li className="flex items-center justify-between px-5 py-2.5">
                <span className="text-[12.5px] text-ink-muted">Medya dosyaları</span>
                <Link href="/app/medya" className="text-[13px] font-bold text-brand-600 hover:underline">
                  {brand._count.mediaAssets}
                </Link>
              </li>
              <li className="flex items-center justify-between px-5 py-2.5">
                <span className="text-[12.5px] text-ink-muted">
                  Sosyal hesaplar{!accountsEnabled && <span className="text-ink-faint"> · Faz 2</span>}
                </span>
                <span className="text-[13px] font-bold text-ink">{brand._count.socialAccounts}</span>
              </li>
              {brand.website && (
                <li className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-[12.5px] text-ink-muted">Web sitesi</span>
                  <span className="max-w-[55%] truncate text-[12.5px] font-semibold text-ink">{brand.website}</span>
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>

      {/* İçerik durumu + son içerikler */}
      <section className="mt-5 card">
        <header className="border-b border-line px-5 py-4">
          <h2 className="section-title">Bu Markanın İçerikleri</h2>
          <p className="section-sub">
            {statusCounts.map((s) => `${s._count._all} ${STATUS_LABEL(s.status)}`).join(' · ') || 'Henüz içerik yok'}
          </p>
        </header>
        {recentContents.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-[13px] text-ink-muted">Bu marka için henüz içerik oluşturulmadı.</p>
            <Link href={`/app/icerik/yeni?marka=${brand.id}`} className="btn-primary btn-md mt-4 inline-flex">
              <Icon name="plus" size={15} /> Yeni İçerik
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {recentContents.map((c) => (
              <li key={c.id}>
                <Link href={`/app/icerik/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-subtle">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-ink">{c.title ?? 'Başlıksız içerik'}</span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-faint">{c._count.platformContents} platform hedefi</span>
                  </span>
                  <Badge tone={c.status === 'READY' ? 'success' : c.status === 'ARCHIVED' ? 'neutral' : 'info'}>
                    {STATUS_LABEL(c.status)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function STATUS_LABEL(status: string): string {
  return (
    (
      {
        DRAFT: 'taslak',
        PROCESSING: 'işleniyor',
        READY: 'hazır',
        ARCHIVED: 'arşivlendi',
        PUBLISHED: 'yayınlandı',
        SCHEDULED: 'planlandı',
        APPROVAL_PENDING: 'onay bekliyor'
      } as Record<string, string>
    )[status] ?? status.toLocaleLowerCase('tr-TR')
  );
}
