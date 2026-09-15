import { Badge } from '@/components/ui';
import { INTEGRATION_STATUS_LABELS } from '@/lib/platforms/platforms';
import type { SystemHealthSnapshot } from '@/lib/ops/systemHealth';

/**
 * Sistem Durumu — yönetici operasyon görünümü (Faz 7 §114-§115).
 * Tüm değerler GERÇEK sorgulardan gelir; sahte yeşil durum ÜRETİLMEZ:
 * veritabanı erişilemezse erişilemez yazılır, başarısız iş gizlenmez.
 * Bu çalışma alanının simülasyon durumu yalnızca bilgilendirme amaçlıdır;
 * üretimde simülasyon modu env kapısıyla zaten zorunlu kapalıdır.
 */

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
  X: 'X (Twitter)',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  PINTEREST: 'Pinterest',
  THREADS: 'Threads'
};

export function SystemHealthView({ snapshot: s }: { snapshot: SystemHealthSnapshot }) {
  const jobHealthy = s.jobs.failed24h === 0 && s.jobs.queued < 100;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Sistem Durumu</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
        Bu çalışma alanının gerçek operasyon verileri. Değerler uydurulmaz; bir bileşen erişilemezse durumu
        açıkça yazılır. Son güncelleme: {fmtTime(s.gatheredAt)}.
      </p>

      {!s.databaseReachable ? (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] text-ink">
          <strong>Veritabanı erişilemez.</strong> Sistem sağlığı doğrulanamıyor; sayaçlar gösterilmiyor.
          Veritabanı bağlantısını kontrol edin — bu durum sahte yeşil durumla gizlenmez.
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Çekirdek bileşenler */}
        <div className="card p-5">
          <h3 className="section-title">Çekirdek Bileşenler</h3>
          <ul className="mt-3 space-y-2 text-[13px]">
            <li className="flex items-center justify-between gap-2">
              <span>Veritabanı</span>
              <Badge tone={s.databaseReachable ? 'success' : 'danger'}>{s.databaseReachable ? 'Erişilebilir' : 'Erişilemez'}</Badge>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Uygulama ortamı</span>
              <Badge tone={s.appEnv === 'production' ? 'brand' : 'neutral'}>{s.appEnv === 'production' ? 'Üretim' : 'Geliştirme/Önizleme'}</Badge>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Simülasyon modu</span>
              <Badge tone={s.simulationMode ? 'warning' : 'success'}>{s.simulationMode ? 'Açık (yalnız geliştirme olabilir)' : 'Kapalı — gerçek paylaşım'}</Badge>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Yapay zekâ motoru</span>
              <Badge tone="neutral">{s.aiMode}</Badge>
            </li>
          </ul>
        </div>

        {/* Yayın sağlığı (son 24 saat) */}
        <div className="card p-5">
          <h3 className="section-title">Yayın Sağlığı (son 24 saat)</h3>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-line p-3">
              <p className="text-[11px] text-ink-faint">Başarılı</p>
              <p className="text-[20px] font-bold">{s.publications.published}</p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <p className="text-[11px] text-ink-faint">Başarısız</p>
              <p className={`text-[20px] font-bold ${s.publications.failed > 0 ? 'text-danger' : ''}`}>{s.publications.failed}</p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <p className="text-[11px] text-ink-faint">Simülasyon</p>
              <p className="text-[20px] font-bold">{s.publications.simulated}</p>
            </div>
          </div>
          <p className="hint mt-2">Simülasyon sayısı yalnız geliştirme ortamında artar; üretimde 0 kalır.</p>
        </div>

        {/* İş kuyruğu */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="section-title">İş Kuyruğu</h3>
            <Badge tone={jobHealthy ? 'success' : 'warning'}>{jobHealthy ? 'Normal' : 'İnceleyin'}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg border border-line p-2.5"><p className="text-[11px] text-ink-faint">Sırada</p><p className="text-[18px] font-bold">{s.jobs.queued}</p></div>
            <div className="rounded-lg border border-line p-2.5"><p className="text-[11px] text-ink-faint">Çalışıyor</p><p className="text-[18px] font-bold">{s.jobs.running}</p></div>
            <div className="rounded-lg border border-line p-2.5"><p className="text-[11px] text-ink-faint">Bitti (24s)</p><p className="text-[18px] font-bold">{s.jobs.done24h}</p></div>
            <div className="rounded-lg border border-line p-2.5"><p className="text-[11px] text-ink-faint">Hatalı (24s)</p><p className={`text-[18px] font-bold ${s.jobs.failed24h > 0 ? 'text-danger' : ''}`}>{s.jobs.failed24h}</p></div>
          </div>
          {s.recentFailedJobs.length > 0 ? (
            <div className="mt-3">
              <p className="text-[12px] font-semibold">Son başarısız işler</p>
              <ul className="mt-1 space-y-1.5">
                {s.recentFailedJobs.map((j) => (
                  <li key={j.id} className="rounded-lg border border-line bg-surface-subtle p-2.5 text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{j.type}</span>
                      <span className="text-ink-muted">{j.attempts}/{j.maxAttempts} deneme • {fmtTime(j.updatedAt)}</span>
                    </div>
                    {j.lastError ? <p className="mt-0.5 text-ink-muted">Hata: {j.lastError.slice(0, 200)}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="hint mt-2">Son 24 saatte başarısız iş yok.</p>
          )}
        </div>

        {/* Entegrasyonlar */}
        <div className="card p-5">
          <h3 className="section-title">Sağlayıcı Entegrasyonları</h3>
          {s.integrations.length === 0 ? (
            <p className="hint mt-2">Kayıtlı entegrasyon yok. Ayarlar → Entegrasyonlar bölümünden durum yükleyin.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-[13px]">
              {s.integrations.map((i) => (
                <li key={i.platform} className="flex items-center justify-between gap-2">
                  <span>{PLATFORM_LABELS[i.platform] ?? i.platform}</span>
                  <span className="flex items-center gap-1.5">
                    {i.credentialsSet ? null : <span className="text-[11px] text-ink-faint">kimlik bilgisi yok</span>}
                    <Badge tone={i.status === 'CONNECTED' ? 'success' : i.status === 'ERROR' ? 'danger' : 'neutral'}>
                      {INTEGRATION_STATUS_LABELS[i.status as keyof typeof INTEGRATION_STATUS_LABELS] ?? i.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
