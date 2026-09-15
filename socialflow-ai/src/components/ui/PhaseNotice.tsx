import Link from 'next/link';
import { MODULE_GATES, isModuleEnabled, type ModuleId } from '@/lib/phase/phaseGates';
import { Icon } from './Icon';

/**
 * Faz kapısı bilgilendirmesi (§3, §5)
 * ---------------------------------------------------------------------------
 * Henüz ilgili fazda etkinleşmeyen bir modülün sayfasında gösterilir.
 * Modül ÇALIŞIYORMUŞ GİBİ SUNULMAZ: sahte veri, sahte metrik veya sahte
 * başarı yerine dürüst bir açıklama ve Faz 1'de yapılabilecekler listelenir.
 */
export function PhaseGateNotice({
  module,
  phase1Alternatives = []
}: {
  module: ModuleId;
  /** Kullanıcının şu anda kullanabileceği Faz 1 karşılıkları. */
  phase1Alternatives?: { href: string; label: string }[];
}) {
  const gate = MODULE_GATES[module];
  const enabled = isModuleEnabled(module);

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-info/10">
          <Icon name="info" size={22} className="text-info" />
        </div>
        <span className="badge-info mb-3 inline-flex">Faz {gate.phase}</span>
        <h1 className="mb-2 text-lg font-semibold text-ink">{gate.label}</h1>
        <p className="mb-6 text-[13.5px] leading-relaxed text-ink-muted">{gate.notice}</p>
        <p className="mb-6 text-[12.5px] leading-relaxed text-ink-faint">
          Faz 1 kapsamı: marka profili ve marka sesi, medya kütüphanesi, tek master içerikten
          platforma özel metin ve görsel türevleri, platform kural kontrolü, otomatik kaydetme ve
          taslak yönetimi.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link className="btn-primary btn-md" href="/app/icerik/yeni">
            <Icon name="plus" size={15} /> Yeni İçerik Oluştur
          </Link>
          {phase1Alternatives.map((alt) => (
            <Link key={alt.href} className="btn-secondary btn-md" href={alt.href}>
              {alt.label}
            </Link>
          ))}
        </div>
        {enabled && (
          <p className="mt-6 text-[12px] text-ink-faint">
            Modül bu kurulumda <code>FF_{module.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}</code> ile açık.
          </p>
        )}
      </div>
    </div>
  );
}

/** Kapı açıksa içeriği, kapalıysa bilgilendirmeyi gösterir. */
export function withPhaseGate(module: ModuleId, content: React.ReactNode, alternatives?: { href: string; label: string }[]) {
  if (isModuleEnabled(module)) return content;
  return <PhaseGateNotice module={module} phase1Alternatives={alternatives} />;
}
