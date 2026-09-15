/**
 * Modül kapıları
 * ---------------------------------------------------------------------------
 * Tamamlanmış ve test edilmiş modüller (yayınlama, zamanlama, hesap bağlama,
 * analitik, bildirimler, AI asistanı) varsayılan olarak AÇIK gelir.
 * Henüz uçtan uca çalışmayan modüller (ör. otomasyon motoru, kreatif stüdyo
 * üretim zinciri) sahte çalışma izlenimi vermemesi için KAPALI gelir; kod
 * korunur, hazır olduğunda tek bayrakla devreye alınır. Kapı kararı kullanıcı
 * arayüzünde değil TEK doğruluk kaynağında verilir.
 *
 * Bayrak: `FF_<MODÜL>` ("true"/"1" veya "false"/"0") ile geçersiz kılınabilir.
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
  /** Varsayılan olarak açık mı? (env override ile değiştirilebilir) */
  defaultEnabled: boolean;
  /** Kullanıcıya gösterilecek dürüst bilgilendirme. */
  notice: string;
}

export const MODULE_GATES: Record<ModuleId, ModuleGate> = {
  socialPublishing: {
    id: 'socialPublishing',
    phase: 2,
    label: 'Sosyal Medyada Yayınlama',
    defaultEnabled: true,
    notice: 'Yayın modülü bu kurulumda kapalı. İçeriklerinizi hazırlayıp taslak olarak saklayabilirsiniz.'
  },
  scheduling: {
    id: 'scheduling',
    phase: 3,
    label: 'Zamanlama ve Otomatik Yayın',
    defaultEnabled: true,
    notice: 'Zamanlanmış otomatik yayın bu kurulumda kapalı. İçerikler taslak/hazır durumunda saklanır.'
  },
  socialAccounts: {
    id: 'socialAccounts',
    phase: 2,
    label: 'Hesap Bağlama (OAuth)',
    defaultEnabled: true,
    notice: 'Sosyal hesap bağlama bu kurulumda kapalı. Hedefleri hesap seçmeden de hazırlayabilirsiniz.'
  },
  analytics: {
    id: 'analytics',
    phase: 4,
    label: 'Analitik ve Raporlama',
    defaultEnabled: true,
    notice: 'Analitik bu kurulumda kapalı; gerçek yayın verisi olmadan gösterilecek metrik yoktur.'
  },
  notifications: {
    id: 'notifications',
    phase: 3,
    label: 'Bildirimler',
    defaultEnabled: true,
    notice: 'Bildirim merkezi bu kurulumda kapalı.'
  },
  aiAssistant: {
    id: 'aiAssistant',
    phase: 2,
    label: 'AI İçerik Asistanı',
    defaultEnabled: true,
    notice:
      'Serbest metin üreten AI asistanı bu kurulumda kapalı. AI; kompozisyondaki “Platformlara Uyarla” adımında metninizi platform kurallarına göre yeniden yazar.'
  },
  creativeStudio: {
    id: 'creativeStudio',
    phase: 4,
    label: 'Kreatif Stüdyo',
    defaultEnabled: true,
    notice: 'Gelişmiş kreatif üretimi bu kurulumda kapalı.'
  },
  automation: {
    id: 'automation',
    phase: 5,
    label: 'Otomasyon Motoru',
    defaultEnabled: false,
    notice: 'Otomasyon motoru bu kurulumda henüz etkin değil.'
  },
  inbox: {
    id: 'inbox',
    phase: 5,
    label: 'Gelen Kutusu',
    defaultEnabled: false,
    notice: 'Birleşik gelen kutusu bu kurulumda kapalı.'
  },
  listening: {
    id: 'listening',
    phase: 5,
    label: 'Sosyal Dinleme',
    defaultEnabled: false,
    notice: 'Sosyal dinleme bu kurulumda kapalı.'
  },
  crm: {
    id: 'crm',
    phase: 6,
    label: 'CRM',
    defaultEnabled: false,
    notice: 'CRM bu kurulumda kapalı.'
  },
  ads: {
    id: 'ads',
    phase: 6,
    label: 'Reklam Yönetimi',
    defaultEnabled: false,
    notice: 'Reklam yönetimi bu kurulumda kapalı.'
  },
  commerce: {
    id: 'commerce',
    phase: 6,
    label: 'Ticaret Entegrasyonları',
    defaultEnabled: false,
    notice: 'Ticaret entegrasyonları bu kurulumda kapalı.'
  },
  attribution: {
    id: 'attribution',
    phase: 6,
    label: 'Atıf Analizi',
    defaultEnabled: false,
    notice: 'Atıf analizi bu kurulumda kapalı.'
  }
};

function envKey(id: ModuleId): string {
  return 'FF_' + id.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/** Modül açık mı? (env override > varsayılan) */
export function isModuleEnabled(id: ModuleId): boolean {
  const raw = process.env[envKey(id)];
  if (raw !== undefined && raw !== '') return raw === 'true' || raw === '1';
  return MODULE_GATES[id].defaultEnabled;
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
