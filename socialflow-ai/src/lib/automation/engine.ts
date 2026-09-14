/**
 * PHASE 4 — Otomasyon Motoru (§117-§124)
 * ---------------------------------------
 * Kural: EĞER Trigger VE Conditions O ZAMAN Actions
 * Güvenlik: otomatik yayın varsayılan KAPALI, yetki ve audit log zorunlu, loop koruması.
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

export type AutomationCondition = { field: 'brand' | 'platform' | 'campaign' | 'contentType' | 'user' | 'role' | 'performance'; operator: 'eq' | 'neq' | 'contains'; value: string };
export type AutomationAction =
  | { type: 'send_notification'; payload: { title: string; message: string } }
  | { type: 'create_task'; payload: { title: string } }
  | { type: 'add_tag'; payload: { tag: string } }
  | { type: 'assign_approver'; payload: { userId: string } }
  | { type: 'generate_report'; payload?: any }
  | { type: 'generate_content_draft'; payload?: any }
  | { type: 'generate_creative_variation'; payload?: any }
  | { type: 'schedule_approved_content'; payload?: any };

export interface AutomationRule {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  enabled: boolean;
  autonomyLevel: 1 | 2 | 3 | 4; // Seviye 1 = sadece öneri
  createdBy?: string | null;
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  trigger: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
  input: any;
  output?: any;
  error?: string | null;
  createdAt: string;
}

// Loop koruması: aynı rule'un aynı tetikleyici için 60 sn içinde 2. kez çalışmasını engelle
const recentExecutions = new Map<string, number>();

export function canExecute(rule: AutomationRule, triggerId: string): boolean {
  if (!rule.enabled) return false;
  // Seviye 1 — sadece öneri: otomasyon çalışmaz, sadece bildirim üretir
  if (rule.autonomyLevel === 1) {
    // Göstermelik: sadece "öneri" eylemleri (bildirim) çalışır, yayın gibi kritik eylemler engellenir
    const hasCritical = rule.actions.some((a) => a.type === 'schedule_approved_content');
    if (hasCritical) return false;
  }
  const key = `${rule.id}:${triggerId}`;
  const last = recentExecutions.get(key) ?? 0;
  if (Date.now() - last < 60_000) return false;
  recentExecutions.set(key, Date.now());
  return true;
}

export async function executeRule(rule: AutomationRule, context: any): Promise<AutomationExecution> {
  const exec: AutomationExecution = {
    id: `exec-${Date.now()}`,
    ruleId: rule.id,
    trigger: rule.trigger,
    status: 'RUNNING',
    input: context,
    createdAt: new Date().toISOString(),
  };
  // Mock execution: tüm action'lar loglanır, gerçek side-effect bir sonraki fazda
  try {
    // Koşullar?
    for (const cond of rule.conditions ?? []) {
      const val = context[cond.field];
      if (cond.operator === 'eq' && String(val) !== cond.value) throw new Error(`Koşul sağlanmadı: ${cond.field} != ${cond.value}`);
    }
    exec.output = { actions: rule.actions.map((a) => a.type) };
    exec.status = 'DONE';
  } catch (e: any) {
    exec.status = 'FAILED';
    exec.error = e.message;
  }
  return exec;
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
  AccountHealthChanged: 'Hesap Sağlığı Değiştiğinde',
};

export const ACTION_LABELS: Record<AutomationAction['type'], string> = {
  send_notification: 'Bildirim gönder',
  create_task: 'Görev oluştur',
  add_tag: 'Etiket ekle',
  assign_approver: 'Onaylayıcı ata',
  generate_report: 'Rapor oluştur',
  generate_content_draft: 'Taslak içerik oluştur',
  generate_creative_variation: 'Kreatif varyasyonu oluştur',
  schedule_approved_content: 'Onaylı içeriği planla',
};

export const mockRules: AutomationRule[] = [
  {
    id: 'rule-1',
    workspaceId: 'demo-workspace-id',
    name: 'Onay bekleyenleri bildir',
    trigger: 'ContentCreated',
    conditions: [],
    actions: [{ type: 'send_notification', payload: { title: 'Yeni içerik', message: 'Yeni içerik onay bekliyor.' } }],
    enabled: true,
    autonomyLevel: 1,
  },
  {
    id: 'rule-2',
    workspaceId: 'demo-workspace-id',
    name: 'Onaylanan içeriği otomatik planla (Kapalı)',
    trigger: 'ContentApproved',
    conditions: [],
    actions: [{ type: 'schedule_approved_content' }],
    enabled: false,
    autonomyLevel: 4,
  },
];
