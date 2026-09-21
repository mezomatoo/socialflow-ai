'use client';

import { Modal } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';

/**
 * Sosyal hesap bağlantılarında veri koruma açıklaması.
 * Bağlantı ekranlarında ve entegrasyon ayarlarında tek kaynaktan gösterilir.
 */
export function SocialAccountPrivacyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Parola ve Kişisel Veri Politikası"
      footer={
        <button className="btn-primary btn-md" onClick={onClose}>
          Anladım
        </button>
      }
    >
      <div className="space-y-3 text-[13px] leading-relaxed text-ink">
        <div className="flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/10 p-3.5">
          <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-success" />
          <p>
            <strong>Sosyal medya parolalarınız asla istenmez, işlenmez ve saklanmaz.</strong> Hesap bağlantıları,
            platformların resmî <strong>OAuth</strong> protokolüyle kurulur: parolanızı yalnızca platformun kendi
            resmî giriş ekranına yazarsınız; bu bilgi SocialFlow’a hiçbir aşamada iletilmez.
          </p>
        </div>

        <div className="space-y-2.5">
          <p>
            <strong className="text-ink">1. İşlenen veriler:</strong> Bağlantı izni verdiğinizde yalnızca platformun
            verdiği <em>erişim anahtarları (OAuth token)</em> ve izin kapsamındaki hesap profili bilgileri (kullanıcı
            adı, görünen ad, profil görseli, içerik ve istatistik verileri) işlenir.
          </p>
          <p>
            <strong className="text-ink">2. Saklama ve güvenlik:</strong> Erişim anahtarları <strong>AES-256-GCM</strong>{' '}
            ile şifrelenerek saklanır; üçüncü taraflarla paylaşılmaz ve yalnızca hizmetin sunulması (yayınlama,
            planlama, analiz) amacıyla kullanılır. Platform API kimlik bilgileri de aynı şekilde şifreli tutulur.
          </p>
          <p>
            <strong className="text-ink">3. Amaç ve hukuki sebep:</strong> Verileriniz, 6698 sayılı KVKK’nın 5/2-c
            “sözleşmenin kurulması ve ifası” ve 5/2-f “veri sorumlusunun meşru menfaati” hukuki sebeplerine dayanarak,
            sosyal medya yönetim hizmetinin sunulması amacıyla işlenir.
          </p>
          <p>
            <strong className="text-ink">4. Saklama süresi ve silme:</strong> Hesap bağlantısını kaldırdığınızda erişim
            anahtarı derhâl silinir ve platformdaki yetki geri alınır. Denetim kayıtları mevzuatın öngördüğü süre
            kadar saklanır. Dilediğiniz zaman verilerinizin silinmesini talep edebilirsiniz.
          </p>
          <p>
            <strong className="text-ink">5. Haklarınız (KVKK m.11):</strong> Kişisel verilerinizin işlenip
            işlenmediğini öğrenme, erişim, düzeltme, silme, itiraz ve zararın giderilmesini talep etme haklarına
            sahipsiniz. Başvurularınızı veri sorumlusuna iletebilirsiniz.
          </p>
          <p className="text-[12px] text-ink-faint">
            Bu metin, KVKK ve AB Genel Veri Koruma Tüzüğü (GDPR) ilkeleriyle uyumlu genel bir bilgilendirmedir;
            işletmenizin veri sorumlusu kimliği ve iletişim bilgileriyle tamamlanmalıdır.
          </p>
        </div>
      </div>
    </Modal>
  );
}
