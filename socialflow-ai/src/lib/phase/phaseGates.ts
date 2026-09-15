/**
 * Faz kapıları (§3, §5)
 * ---------------------------------------------------------------------------
 * Uygulamada Faz 2–6 için yazılmış altyapı kodu bulunur (yayınlama, kuyruk,
 * analitik, bildirim, OAuth bağlantıları, otomasyon). KURAL: bir modül, ait
 * olduğu faz teslim edilmeden "çalışıyormuş gibi" SUNULMAZ. Kapı kararı
 * kullanıcı arayüzünde değil, buradaki tek doğruluk kaynağında verilir.
 *
 * Faz 2 teslimi ile sosyal yayınlama, zamanlama (kuyruk/worker), hesap
 * bağlama ve bildirim merkezi gerçek ve testli hale geldiği için
 * `CURRENT_PHASE = 2` üzerine oturan modüller artık varsayılan AÇIKTIR.
 * Daha sonraki fazlara ait modüller dürüst bilgilendirmeyle KAPALI kalır.
 *
 * Bayrak: `FF_<MODÜL>` (true/1/false/0) ile geçersiz kılınabilir.
 */
import { AppError } from '../errors';

/** Uygulamada teslim edilmiş en yüksek faz (Faz 2: gerçek yayınlama + planlama + hesaplar). */
export const CURRENT_PHASE = 2;

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
  /** Faz 1 modunda (CURRENT_PHASE=1) varsayılan olarak açık mı? */
  enabledInPhase1: boolean;
  /** Modül kapalıyken (ör. FF_...=false) gösterilecek dürüst bilgilendirme. */
  notice: string;
}

export const MODULE_GATES: Record<ModuleId, ModuleGate> = {
  socialPublishing: {
    id: 'socialPublishing',
    phase: 2,
    label: 'Sosyal Medyada Yayınlama',
    enabledInPhase1: false,
    notice: 'Gerçek sosyal medya yayını bu kurulumda kapalı (FF_SOCIAL_PUBLISHING=false). İçeriklerinizi hazırlayıp taslak olarak saklayabilirsiniz.'
  },
  scheduling: {
    id: 'scheduling',
    phase: 2,
    label: 'Zamanlama ve Otomatik Yayın',
    enabledInPhase1: false,
    notice: 'Zamanlanmış otomatik yayın bu kurulumda kapalı (FF_SCHEDULING=false). İçerikler taslak/hazır durumunda saklanır.'
  },
  socialAccounts: {
    id: 'socialAccounts',
    phase: 2,
    label: 'Hesap Bağlama (OAuth)',
    enabledInPhase1: false,
    notice: 'Sosyal hesap bağlama bu kurulumda kapalı (FF_SOCIAL_ACCOUNTS=false).'
  },
  analytics: {
    id: 'analytics',
    phase: 4,
    label: 'Analitik ve Raporlama',
    enabledInPhase1: false,
    notice: 'Analitik ve raporlama bu kurulumda henüz etkin değil; gerçek yayın verisi olmadan gösterilecek metrik yoktur.'
  },
  notifications: {
    id: 'notifications',
    phase: 2,
    label: 'Bildirimler',
    enabledInPhase1: false,
    notice: 'Bildirim merkezi bu kurulumda kapalı (FF_NOTIFICATIONS=false).'
  },
  aiAssistant: {
    id: 'aiAssistant',
    phase: 2,
    label: 'AI İçerik Asistanı',
    enabledInPhase1: false,
    notice:
      'Serbest metin üreten AI asistanı bu kurulumda henüz etkin değil. AI, kompozisyondaki “Platformlara Uyarla” adımında metninizi platform kurallarına göre yeniden yazar.'
  },
  creativeStudio: {
    id: 'creativeStudio',
    phase: 4,
    label: 'Kreatif Stüdyo',
    enabledInPhase1: false,
    notice: 'Gelişmiş kreatif üretimi bu kurulumda henüz etkin değil.'
  },
  automation: {
    id: 'automation',
    phase: 5,
    label: 'Otomasyon Motoru',
    enabledInPhase1: false,
    notice: 'Otomasyon motoru bu kurulumda henüz etkin değil.'
  },
  inbox: {
    id: 'inbox',
    phase: 5,
    label: 'Gelen Kutusu',
    enabledInPhase1: false,
    notice: 'Birleşik gelen kutusu bu kurulumda henüz etkin değil.'
  },
  listening: {
    id: 'listening',
    phase: 5,
    label: 'Sosyal Dinleme',
    enabledInPhase1: false,
    notice: 'Sosyal dinleme bu kurulumda henüz etkin değil.'
  },
  crm: {
    id: 'crm',
    phase: 6,
    label: 'CRM',
    enabledInPhase1: false,
    notice: 'CRM bu kurulumda henüz etkin değil.'
  },
  ads: {
    id: 'ads',
    phase: 6,
    label: 'Reklam Yönetimi',
    enabledInPhase1: false,
    notice: 'Reklam yönetimi bu kurulumda henüz etkin değil.'
  },
  commerce: {
    id: 'commerce',
    phase: 6,
    label: 'Ticaret Entegrasyonları',
    enabledInPhase1: false,
    notice: 'Ticaret entegrasyonları bu kurulumda henüz etkin değil.'
  },
  attribution: {
    id: 'attribution',
    phase: 6,
    label: 'Atıf Analizi',
    enabledInPhase1: false,
    notice: 'Atıf analizi bu kurulumda henüz etkin değil.'
  }
};

function envKey(id: ModuleId): string {
  return 'FF_' + id.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/**
 * Modül açık mı? (env override > faz varsayılanı)
 * Faz varsayılanı: modülün fazı, teslim edilen güncel faza (CURRENT_PHASE)
 * eşit veya ondan küçükse AÇIK; aksi halde Kapalı.
 */
export function isModuleEnabled(id: ModuleId): boolean {
  const raw = process.env[envKey(id)];
  if (raw !== undefined && raw !== '') return raw === 'true' || raw === '1';
  const gate = MODULE_GATES[id];
  return gate.enabledInPhase1 || gate.phase <= CURRENT_PHASE;
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
