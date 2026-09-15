/**
 * PHASE 4 — Otomasyon Motoru (§98-§103, §124)
 * ---------------------------------------
 * Kural: EĞER Trigger VE Conditions O ZAMAN Actions.
 *
 * SUNUCU TARAFINDA ÇALIŞIR; kurallar ve yürütmeler GERÇEK veritabanı
 * kayıtlarıdır (AutomationRule / AutomationExecution). mockRules kaldırıldı.
 *
 * GÜVENLİK:
 *  - Otomatik yayın (schedule_approved_content) motor düzeyinde KAPALIDIR (§101);
 *    ilgili aksiyon SKIPPED kayda düşer ve dürüst gerekçe yazar.
 *  - Özerklik düzeyi 1 (Sadece Öneri) yalnızca bildirim üretir, aksiyon çalıştırmaz (§100).
 *  - Döngü koruması (§102): aynı kural + tetikleyici varlık (triggerId) için
 *    PENCERE_MS içinde ikinci yürütme engellenir; her (rule, triggerId) en fazla
 *    bir kez çalışır — zincirleme yeniden tetikleme durdurulur (§139).
 *  - Ana akış izolasyonu (§106): runTriggers ASLA fırlatmaz; hatalar FAILED
 *    yürütme kaydına yazılır ve arayüzde görünür (§124).
 *  - Her yürütme audit'e yazılır (§124).
 */
import prisma from '../prisma';
import { notify } from '../services/notifications';
import { audit } from '../security/audit';
import { logger } from '../observability';
import { isModuleEnabled } from '../phase/phaseGates';
import {
  TRIGGER_LABELS,
  ACTION_LABELS,
  AUTONOMY_LABELS,
  type AutomationTrigger,
  type AutomationCondition,
  type AutomationAction,
  type AutomationRuleDTO
} from './labels';

// İstemci güvenli etiket/ tipler tek kaynaktan (labels.ts) dışa açılır.
export { TRIGGER_LABELS, ACTION_LABELS, AUTONOMY_LABELS };
export type { AutomationTrigger, AutomationCondition, AutomationAction, AutomationRuleDTO };

const PENCERE_MS = 60_000;
const MAX_EXECUTIONS_PER_RULE_PER_HOUR = 30;

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToRule(row: {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  trigger: string;
  conditions: string;
  actions: string;
  enabled: boolean;
  autonomyLevel: number;
  createdBy: string | null;
  createdAt: Date;
}): AutomationRuleDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    trigger: row.trigger as AutomationTrigger,
    conditions: parseJson<AutomationCondition[]>(row.conditions, []),
    actions: parseJson<AutomationAction[]>(row.actions, []),
    enabled: row.enabled,
    autonomyLevel: (Math.min(4, Math.max(1, row.autonomyLevel)) as 1 | 2 | 3 | 4),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString()
  };
}

/** Koşullar bağlam değerlendirilir (eq/neq/contains); alan yoksa koşul sağlanmaz. */
export function conditionsMatch(conditions: AutomationCondition[], context: Record<string, unknown>): boolean {
  for (const cond of conditions) {
    const value = context[cond.field];
    if (cond.operator === 'eq' && String(value ?? '') !== cond.value) return false;
    if (cond.operator === 'neq' && String(value ?? '') === cond.value) return false;
    if (cond.operator === 'contains' && !String(value ?? '').toLowerCase().includes(cond.value.toLowerCase())) return false;
  }
  return true;
}

const SUPPORTED_TRIGGERS = Object.keys(TRIGGER_LABELS);
const SUPPORTED_ACTIONS = Object.keys(ACTION_LABELS);

function validateRuleInput(input: { name: string; trigger: string; actions: AutomationAction[]; conditions?: AutomationCondition[]; autonomyLevel?: number }): string | null {
  if (!input.name?.trim()) return 'Kural adı gereklidir.';
  if (!SUPPORTED_TRIGGERS.includes(input.trigger)) return 'Geçersiz tetikleyici.';
  if (!Array.isArray(input.actions) || input.actions.length === 0) return 'En az bir aksiyon seçilmelidir.';
  for (const action of input.actions) {
    if (!SUPPORTED_ACTIONS.includes(action?.type)) return `Geçersiz aksiyon: ${action?.type}`;
    if (action.type === 'send_notification' && !action.payload?.title) return 'Bildirim aksiyonu başlık gerektirir.';
    if (action.type === 'create_task' && !action.payload?.title) return 'Görev aksiyonu başlık gerektirir.';
  }
  if (input.autonomyLevel !== undefined && ![1, 2, 3, 4].includes(input.autonomyLevel)) return 'Özerklik düzeyi 1-4 olmalıdır.';
  return null;
}

/** Kural oluşturur (çalışma alanına özgü, denetimli). */
export async function createRule(
  ctx: { workspaceId: string; userId: string },
  input: { name: string; description?: string | null; trigger: AutomationTrigger; conditions: AutomationCondition[]; actions: AutomationAction[]; enabled?: boolean; autonomyLevel?: 1 | 2 | 3 | 4 }
): Promise<{ rule?: AutomationRuleDTO; error?: string }> {
  const error = validateRuleInput({ ...input, trigger: input.trigger });
  if (error) return { error };
  const row = await prisma.automationRule.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: input.name.trim().slice(0, 120),
      description: input.description?.slice(0, 400) ?? null,
      trigger: input.trigger,
      conditions: JSON.stringify(input.conditions ?? []),
      actions: JSON.stringify(input.actions),
      enabled: input.enabled ?? false,
      autonomyLevel: input.autonomyLevel ?? 1,
      createdBy: ctx.userId
    }
  });
  await audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: 'automation.rule.created', entityType: 'AutomationRule', entityId: row.id, metadata: { trigger: input.trigger } });
  return { rule: rowToRule(row) };
}

export async function listRules(workspaceId: string): Promise<AutomationRuleDTO[]> {
  const rows = await prisma.automationRule.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  return rows.map(rowToRule);
}

export async function updateRule(
  ctx: { workspaceId: string; userId: string },
  id: string,
  patch: { name?: string; description?: string | null; enabled?: boolean; autonomyLevel?: 1 | 2 | 3 | 4; conditions?: AutomationCondition[]; actions?: AutomationAction[] }
): Promise<AutomationRuleDTO | null> {
  const existing = await prisma.automationRule.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!existing) return null;
  if (patch.actions) {
    const error = validateRuleInput({ name: patch.name ?? existing.name, trigger: existing.trigger, actions: patch.actions, autonomyLevel: patch.autonomyLevel });
    if (error) throw new Error(error);
  }
  const row = await prisma.automationRule.update({
    where: { id: existing.id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 120) } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.slice(0, 400) ?? null } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.autonomyLevel !== undefined ? { autonomyLevel: patch.autonomyLevel } : {}),
      ...(patch.conditions !== undefined ? { conditions: JSON.stringify(patch.conditions) } : {}),
      ...(patch.actions !== undefined ? { actions: JSON.stringify(patch.actions) } : {})
    }
  });
  await audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: 'automation.rule.updated', entityType: 'AutomationRule', entityId: id, metadata: { keys: Object.keys(patch) } });
  return rowToRule(row);
}

export async function deleteRule(ctx: { workspaceId: string; userId: string }, id: string): Promise<boolean> {
  const existing = await prisma.automationRule.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!existing) return false;
  await prisma.automationRule.delete({ where: { id: existing.id } });
  await audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: 'automation.rule.deleted', entityType: 'AutomationRule', entityId: id });
  return true;
}

/** Kuralın yürütmeleri (başarısızlar dahil görünür — §124). */
export async function listExecutions(workspaceId: string, ruleId: string, take = 30) {
  const rows = await prisma.automationExecution.findMany({
    where: { workspaceId, ruleId },
    orderBy: { createdAt: 'desc' },
    take
  });
  return rows.map((r) => ({
    id: r.id,
    ruleId: r.ruleId,
    trigger: r.trigger,
    triggerId: r.triggerId,
    status: r.status,
    input: parseJson<Record<string, unknown>>(r.input, {}),
    output: r.output ? parseJson<Record<string, unknown>>(r.output, {}) : null,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null
  }));
}

/**
 * Döngü koruması + hız sınırı (§102): aynı (rule, triggerId) PENCERE_MS içinde
 * tekrar çalışmaz; saatlik üst sınır aşılırsa kural atlanır.
 */
async function loopGuard(ruleId: string, triggerId: string): Promise<{ allowed: boolean; reason?: string }> {
  const since = new Date(Date.now() - PENCERE_MS);
  const recent = await prisma.automationExecution.findFirst({
    where: { ruleId, triggerId, createdAt: { gte: since } }
  });
  if (recent) return { allowed: false, reason: 'Aynı tetikleyici için kısa süre önce çalıştı (döngü koruması).' };
  const hourlyStart = new Date(Date.now() - 3_600_000);
  const hourlyCount = await prisma.automationExecution.count({ where: { ruleId, createdAt: { gte: hourlyStart } } });
  if (hourlyCount >= MAX_EXECUTIONS_PER_RULE_PER_HOUR) return { allowed: false, reason: 'Saatlik yürütme sınırına ulaşıldı.' };
  return { allowed: true };
}

async function linkedContentId(workspaceId: string, raw: unknown): Promise<string | null> {
  if (typeof raw !== 'string' || !raw) return null;
  const found = await prisma.content.findFirst({ where: { id: raw, workspaceId }, select: { id: true } });
  return found?.id ?? null;
}

async function executeAction(
  ctx: { workspaceId: string; userId?: string | null },
  rule: AutomationRuleDTO,
  action: AutomationAction,
  context: Record<string, unknown>
): Promise<{ executed: boolean; detail: string }> {
  switch (action.type) {
    case 'send_notification': {
      // contentId yalnızca GERÇEK bir içeriğe bağlıysa yazılır; uydurma kimlik
      // FK ihlali yaratır ve notify() hatayı yutar (dürüstlük §124).
      const linked = await linkedContentId(ctx.workspaceId, context.contentId);
      const created = await notify(ctx.workspaceId, {
        type: 'SYSTEM',
        title: action.payload.title.slice(0, 120),
        message: action.payload.message.slice(0, 500),
        severity: 'INFO',
        contentId: linked,
        actionRoute: linked ? `/app/icerik/${linked}` : null
      });
      if (!created) return { executed: false, detail: 'Bildirim kaydedilemedi' };
      return { executed: true, detail: 'Bildirim gönderildi' };
    }
    case 'create_task': {
      await notify(ctx.workspaceId, {
        type: 'REMINDER',
        title: `Görev: ${action.payload.title.slice(0, 100)}`,
        message: `${rule.name} kuralı bir görev oluşturdu.`,
        severity: 'INFO',
        actionRoute: action.payload.route ?? (typeof context.contentId === 'string' ? `/app/icerik/${context.contentId}` : '/app/icerik/taslaklar')
      });
      return { executed: true, detail: 'Görev (hatırlatma) oluşturuldu' };
    }
    case 'generate_content_draft': {
      // Özerklik ≥ 2 gerekir; taslak ASLA yayınlanmaz (§83/§101).
      if (rule.autonomyLevel < 2) return { executed: false, detail: 'Özerklik düzeyi taslak oluşturmaya izin vermiyor' };
      const brandId = typeof context.brandId === 'string' ? context.brandId : null;
      if (!brandId) return { executed: false, detail: 'Marka bağlamı yok; taslak oluşturulmadı' };
      const { createContent } = await import('../services/contentService');
      const topic = typeof context.title === 'string' ? context.title : rule.name;
      const content = await createContent({
        workspaceId: ctx.workspaceId,
        brandId,
        title: `Otomasyon taslağı: ${topic}`.slice(0, 120),
        masterCaption: `${rule.name} kuralı tarafından önerilen taslak. Lütfen gözden geçirin.`,
        userId: ctx.userId ?? null
      });
      await prisma.content.update({ where: { id: content.id }, data: { origin: 'AI_GENERATED' } });
      return { executed: true, detail: `Taslak oluşturuldu: ${content.id}` };
    }
    case 'generate_report': {
      // Gerçek rapor üretimi sonraki adımdır; dürüst kayıt düşer.
      return { executed: false, detail: 'Rapor üretimi henüz etkin değil; istek kayıt altında' };
    }
    case 'schedule_approved_content': {
      // §101: otomatik yayın ASLA sessizce etkinleşmez.
      return { executed: false, detail: 'Otomatik yayın bu kurulumda güvenlik nedeniyle kapalı (açık izin + audit gerekir)' };
    }
    default:
      return { executed: false, detail: 'Bilinmeyen aksiyon' };
  }
}

/**
 * Tetikleyiciyi değerlendirir ve uygun kuralları çalıştırır (§98-§99).
 * ASLA fırlatmaz (§106): her kural için AutomationExecution kaydı yazılır;
 * başarısızlıklar FAILED olarak görünür (§124).
 */
export async function runTriggers(
  trigger: AutomationTrigger,
  triggerId: string,
  ctx: { workspaceId: string; userId?: string | null },
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    if (!isModuleEnabled('automation')) return;
    const rules = await prisma.automationRule.findMany({
      where: { workspaceId: ctx.workspaceId, trigger, enabled: true }
    });
    for (const row of rules) {
      const rule = rowToRule(row);
      // Döngü koruması KAYIT OLUŞTURULDAN ÖNCE yapılır; aksi halde koruma
      // kendi oluşturacağı RUNNING kaydıyla eşleşir (§139).
      const preGuard = await loopGuard(rule.id, triggerId);
      if (!preGuard.allowed) {
        await prisma.automationExecution.create({
          data: {
            workspaceId: ctx.workspaceId,
            ruleId: rule.id,
            trigger,
            triggerId,
            status: 'SKIPPED',
            input: JSON.stringify({ context, autonomyLevel: rule.autonomyLevel }),
            error: preGuard.reason,
            finishedAt: new Date()
          }
        });
        continue;
      }
      const execution = await prisma.automationExecution.create({
        data: {
          workspaceId: ctx.workspaceId,
          ruleId: rule.id,
          trigger,
          triggerId,
          status: 'RUNNING',
          input: JSON.stringify({ context, autonomyLevel: rule.autonomyLevel })
        }
      });
      try {
        if (!conditionsMatch(rule.conditions, context)) {
          await prisma.automationExecution.update({
            where: { id: execution.id },
            data: { status: 'SKIPPED', error: 'Koşullar sağlanmadı', finishedAt: new Date() }
          });
          continue;
        }
        // §100 — düzey 1: yalnızca öneri (aksiyon çalışmaz, bilgilendirme üretilir)
        if (rule.autonomyLevel === 1) {
          await notify(ctx.workspaceId, {
            type: 'SYSTEM',
            title: `Öneri: ${rule.name}`,
            message: `${TRIGGER_LABELS[trigger]} tetiklendi. Kural "Sadece Öneri" düzeyinde; aksiyon otomatik çalıştırılmadı.`,
            severity: 'INFO'
          });
          await prisma.automationExecution.update({
            where: { id: execution.id },
            data: { status: 'SKIPPED', output: JSON.stringify({ suggestionOnly: true }), finishedAt: new Date() }
          });
          continue;
        }

        const results: { type: string; executed: boolean; detail: string }[] = [];
        for (const action of rule.actions) {
          const r = await executeAction(ctx, rule, action, context);
          results.push({ type: action.type, ...r });
        }
        const anyExecuted = results.some((r) => r.executed);
        await prisma.automationExecution.update({
          where: { id: execution.id },
          data: {
            status: 'DONE',
            output: JSON.stringify({ results }),
            finishedAt: new Date()
          }
        });
        if (anyExecuted) {
          await audit({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId ?? null,
            action: 'automation.executed',
            entityType: 'AutomationRule',
            entityId: rule.id,
            metadata: { trigger, triggerId, results }
          });
        }
      } catch (ruleError) {
        await prisma.automationExecution
          .update({
            where: { id: execution.id },
            data: {
              status: 'FAILED',
              error: ruleError instanceof Error ? ruleError.message.slice(0, 400) : 'bilinmeyen hata',
              finishedAt: new Date()
            }
          })
          .catch(() => undefined);
        logger.warn({ event: 'automation.rule_failed', ruleId: rule.id, errorMessage: ruleError instanceof Error ? ruleError.message : String(ruleError) });
      }
    }
  } catch (error) {
    // Ana akış ASLA bozulmaz (§106)
    logger.warn({ event: 'automation.dispatch_failed', trigger, errorMessage: error instanceof Error ? error.message : String(error) });
  }
}

/** Ateşle-unut sarmalayıcı: içerik/yayın akışından güvenle çağrılır (§106). */
export function dispatchTrigger(
  trigger: AutomationTrigger,
  triggerId: string,
  ctx: { workspaceId: string; userId?: string | null },
  context: Record<string, unknown> = {}
): void {
  void runTriggers(trigger, triggerId, ctx, context);
}
