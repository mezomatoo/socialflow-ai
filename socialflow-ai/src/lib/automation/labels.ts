/**
 * Otomasyon etiketleri ve tip takma adları — İSTEMCİ GÜVENLİ.
 * ---------------------------------------------------------------------------
 * Bu modül yalnızca sabit ve tip içerir; sunucu bağımlılığı (prisma vb.)
 * yoktur. Arayüz bileşenleri buradan, motor ise engine.ts üzerinden kullanır
 * (engine.ts bu dosyayı yeniden dışa açar — tek doğruluk kaynağı).
 */

export type AutomationTrigger =
  | 'ContentCreated'
  | 'ContentApproved'
  | 'ContentRejected'
  | 'ScheduledTimeReached'
  | 'PublicationSucceeded'
  | 'PublicationFailed'
  | 'CampaignStarted'
  | 'CampaignEnded'
  | 'AnalyticsUpdated'
  | 'AccountHealthChanged';

export type AutomationCondition = {
  field: string;
  operator: 'eq' | 'neq' | 'contains';
  value: string;
};

export type AutomationAction =
  | { type: 'send_notification'; payload: { title: string; message: string } }
  | { type: 'create_task'; payload: { title: string; route?: string } }
  | { type: 'generate_content_draft'; payload?: Record<string, unknown> }
  | { type: 'generate_report'; payload?: Record<string, unknown> }
  | { type: 'schedule_approved_content'; payload?: Record<string, unknown> };

export interface AutomationRuleDTO {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  enabled: boolean;
  autonomyLevel: 1 | 2 | 3 | 4;
  createdBy?: string | null;
  createdAt?: string;
}

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  ContentCreated: 'İçerik Oluşturulduğunda',
  ContentApproved: 'İçerik Onaylandığında',
  ContentRejected: 'İçerik Reddedildiğinde',
  ScheduledTimeReached: 'Planlanan Zaman Geldiğinde',
  PublicationSucceeded: 'Yayın Başarılı Olduğunda',
  PublicationFailed: 'Yayın Başarısız Olduğunda',
  CampaignStarted: 'Kampanya Başladığında',
  CampaignEnded: 'Kampanya Bittiğinde',
  AnalyticsUpdated: 'Analitik Güncellendiğinde',
  AccountHealthChanged: 'Hesap Sağlığı Değiştiğinde'
};

export const ACTION_LABELS: Record<AutomationAction['type'], string> = {
  send_notification: 'Bildirim gönder',
  create_task: 'Görev oluştur',
  generate_content_draft: 'Taslak içerik oluştur',
  generate_report: 'Rapor oluştur',
  schedule_approved_content: 'Onaylı içeriği planla'
};

export const AUTONOMY_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Sadece Öneri',
  2: 'Taslak Oluştur',
  3: 'Plan Oluştur',
  4: 'Onay Sonrası Otomasyon'
};

/** Koşul operatörlerinin arayüz etiketleri. */
export const CONDITION_OPERATOR_LABELS: Record<AutomationCondition['operator'], string> = {
  eq: 'eşitse',
  neq: 'eşit değilse',
  contains: 'içeriyorsa'
};
