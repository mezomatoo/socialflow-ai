/**
 * Faz kapıları (§3, §5)
 * ---------------------------------------------------------------------------
 * Uygulamada Faz 2–6 için yazılmış altyapı kodu bulunur (yayınlama, kuyruk,
 * analitik, bildirim, OAuth bağlantıları, otomasyon). Faz 1 KURALI: bu modüller
 * çalışıyormuş gibi SUNULMAZ. Kaldırmak yerine MERKEZİ TEK KAPI üzerinden
 * kapatılırlar; böylece:
 *   - arayüzde "çalışıyor" izlenimi veren sahte başarı yoktur,
 *   - kod korunur ve ilgili faz açıldığında tek bayrakla devreye girer,
 *   - kapı kararı kullanıcı arayüzünde değil tek doğruluk kaynağında verilir.
 *
 * Bayrak: `FF_<MODÜL>` (true/1) ile geçersiz kılınabilir. Varsayılanlar Faz 1
 * için bilinçli olarak KAPALI seçilmiştir.
 */
import { AppError } from '../errors';

export type ModuleId =
  | 'socialPublishing'
  | 'scheduling'
  | 'socialAccounts'
  | 'analytics'
  | 'notifications'
  | 'aiAssistant'
  | 'creativeStudio'
  | 'automation'
  | 'inbox'
  | 'listening'
  | 'crm'
  | 'ads'
  | 'commerce'
  | 'attribution';

export interface ModuleGate {
  id: ModuleId;
  /** Modülün ait olduğu faz. */
  phase: 2 | 3 | 4 | 5 | 6;
  label: string;
  /** Faz 1'de varsayılan olarak kapalı mı? */
  enabledInPhase1: boolean;
  /** Kullanıcıya gösterilecek dürüst bilgilendirme. */
  notice: string;
}

export const MODULE_GATES: Record<ModuleId, ModuleGate> = {
  socialPublishing: {
    id: 'socialPublishing',
    phase: 2,
    label: 'Sosyal Medyada Yayınlama',
    enabledInPhase1: false,
    notice: 'Gerçek sosyal medya yayını Faz 2’de etkinleşecek. İçeriklerinizi şimdi hazırlayıp taslak olarak saklayabilirsiniz.'
  },
  scheduling: {
    id: 'scheduling',
    phase: 3,
    label: 'Zamanlama ve Otomatik Yayın',
    enabledInPhase1: false,
    notice: 'Zamanlanmış otomatik yayın Faz 3’te etkinleşecek. Faz 1’de içerikler taslak/hazır durumunda saklanır.'
  },
  socialAccounts: {
    id: 'socialAccounts',
    phase: 2,
    label: 'Hesap Bağlama (OAuth)',
    enabledInPhase1: false,
    notice: 'Sosyal hesap bağlama Faz 2’de etkinleşecek. Şimdilik hedefleri hesap seçmeden de hazırlayabilirsiniz.'
  },
  analytics: {
    id: 'analytics',
    phase: 4,
    label: 'Analitik ve Raporlama',
    enabledInPhase1: false,
    notice: 'Analitik Faz 4’te etkinleşecek; gerçek yayın verisi olmadan gösterilecek metrik yoktur.'
  },
  notifications: {
    id: 'notifications',
    phase: 3,
    label: 'Bildirimler',
    enabledInPhase1: false,
    notice: 'Bildirim merkezi Faz 3’te etkinleşecek.'
  },
  aiAssistant: {
    id: 'aiAssistant',
    phase: 2,
    label: 'AI İçerik Asistanı',
    enabledInPhase1: false,
    notice:
      'Serbest metin üreten AI asistanı Faz 2’de etkinleşecek. Faz 1’de AI, kompozisyondaki “Platformlara Uyarla” adımında metninizi platform kurallarına göre yeniden yazar.'
  },
  creativeStudio: {
    id: 'creativeStudio',
    phase: 4,
    label: 'Kreatif Stüdyo',
    enabledInPhase1: false,
    notice: 'Gelişmiş kreatif üretimi Faz 4’te etkinleşecek.'
  },
  automation: {
    id: 'automation',
    phase: 5,
    label: 'Otomasyon Motoru',
    enabledInPhase1: false,
    notice: 'Otomasyon Faz 5’te etkinleşecek.'
  },
  inbox: {
    id: 'inbox',
    phase: 5,
    label: 'Gelen Kutusu',
    enabledInPhase1: false,
    notice: 'Birleşik gelen kutusu Faz 5’te etkinleşecek.'
  },
  listening: {
    id: 'listening',
    phase: 5,
    label: 'Sosyal Dinleme',
    enabledInPhase1: false,
    notice: 'Sosyal dinleme Faz 5’te etkinleşecek.'
  },
  crm: {
    id: 'crm',
    phase: 6,
    label: 'CRM',
    enabledInPhase1: false,
    notice: 'CRM Faz 6’da etkinleşecek.'
  },
  ads: {
    id: 'ads',
    phase: 6,
    label: 'Reklam Yönetimi',
    enabledInPhase1: false,
    notice: 'Reklam yönetimi Faz 6’da etkinleşecek.'
  },
  commerce: {
    id: 'commerce',
    phase: 6,
    label: 'Ticaret Entegrasyonları',
    enabledInPhase1: false,
    notice: 'Ticaret entegrasyonları Faz 6’da etkinleşecek.'
  },
  attribution: {
    id: 'attribution',
    phase: 6,
    label: 'Atıf Analizi',
    enabledInPhase1: false,
    notice: 'Atıf analizi Faz 6’da etkinleşecek.'
  }
};

function envKey(id: ModuleId): string {
  return 'FF_' + id.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/** Modül açık mı? (env override > faz varsayılanı) */
export function isModuleEnabled(id: ModuleId): boolean {
  const raw = process.env[envKey(id)];
  if (raw !== undefined && raw !== '') return raw === 'true' || raw === '1';
  return MODULE_GATES[id].enabledInPhase1;
}

export function moduleNotice(id: ModuleId): string {
  return MODULE_GATES[id].notice;
}

/**
 * Modül kapalıysa normalleştirilmiş 501 hatası fırlatır.
 * Sahte başarı döndürmek YASAKTIR; bunun yerine açık ve dürüst mesaj verilir.
 */
export function assertModuleEnabled(id: ModuleId): void {
  if (isModuleEnabled(id)) return;
  const gate = MODULE_GATES[id];
  throw new AppError('MODULE_NOT_ENABLED', gate.notice, {
    status: 501,
    details: { module: id, phase: gate.phase, label: gate.label },
    recoverable: true
  });
}

/** Arayüz için modül durumları (tek istekte). */
export function moduleState(): Record<ModuleId, { enabled: boolean; phase: number; label: string; notice: string }> {
  return (Object.keys(MODULE_GATES) as ModuleId[]).reduce(
    (acc, id) => {
      const gate = MODULE_GATES[id];
      acc[id] = { enabled: isModuleEnabled(id), phase: gate.phase, label: gate.label, notice: gate.notice };
      return acc;
    },
    {} as Record<ModuleId, { enabled: boolean; phase: number; label: string; notice: string }>
  );
}
