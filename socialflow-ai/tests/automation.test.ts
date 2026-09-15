/**
 * Otomasyon Motoru (Faz 4 §98-§103, §124, §139)
 * ---------------------------------------------------------------------------
 * - Kurallar GERÇEK veritabanına kaydedilir; CRUD çalışma alanına özgüdür.
 * - Tetikleyici çalıştırınca koşullar değerlendirilir, aksiyonlar GERÇEK etki
 *   yaratır (bildirim/görev kaydı) ve AutomationExecution kaydı oluşur.
 * - Döngü koruması (§139): aynı (kural, tetikleyici) pencere içinde tekrar
 *   çalışmaz.
 * - Özerklik düzeyi 1 yalnızca öneri üretir (§100); otomatik yayın yasaktır (§101).
 * - Başarısız yürütmeler görünürdür (§124); çapraz çalışma alanı erişilemez.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../src/lib/prisma';
import { getSeedContext, type SeedContext } from './helpers';
import { createRule, updateRule, deleteRule, listRules, runTriggers, listExecutions, conditionsMatch } from '../src/lib/automation/engine';

describe('Otomasyon Motoru: kural, yürütme, döngü koruması, güvenlik', () => {
  let ctx: SeedContext;
  let ruleId: string;
  const notificationTitles: string[] = [];

  before(async () => {
    ctx = await getSeedContext();
  });

  after(async () => {
    if (ruleId) await prisma.automationRule.deleteMany({ where: { id: ruleId } });
    await prisma.notification.deleteMany({ where: { workspaceId: ctx.workspaceId, title: { in: notificationTitles } } });
  });

  it('§124 — kural oluşturma doğrulamayla GERÇEK kayıt açar', async () => {
    const bad = await createRule({ workspaceId: ctx.workspaceId, userId: ctx.userId }, {
      name: '',
      trigger: 'ContentCreated',
      conditions: [],
      actions: [{ type: 'send_notification', payload: { title: 'x', message: 'y' } }]
    });
    assert.ok(bad.error, 'boş ad reddedilmeli');

    const badAction = await createRule({ workspaceId: ctx.workspaceId, userId: ctx.userId }, {
      name: 'Geçersiz aksiyon',
      trigger: 'ContentCreated',
      conditions: [],
      actions: [{ type: 'schedule_approved_content' } as never]
    });
    assert.ok(!badAction.error, 'tanımlı aksiyon kaydedilebilmeli (motor çalıştırırken engeller)');

    const created = await createRule({ workspaceId: ctx.workspaceId, userId: ctx.userId }, {
      name: 'Test kuralı — yeni içerik bildirimi',
      trigger: 'ContentCreated',
      conditions: [{ field: 'status', operator: 'eq', value: 'DRAFT' }],
      actions: [
        { type: 'send_notification', payload: { title: 'AUTO-TEST bildirim', message: 'Yeni içerik oluşturuldu.' } },
        { type: 'create_task', payload: { title: 'AUTO-TEST görev', route: '/app/icerik/taslaklar' } }
      ],
      enabled: true,
      autonomyLevel: 2
    });
    assert.ok(created.rule);
    ruleId = created.rule!.id;
    notificationTitles.push('AUTO-TEST bildirim', 'Görev: AUTO-TEST görev', 'Öneri: Test kuralı — yeni içerik bildirimi');

    const rows = await listRules(ctx.workspaceId);
    assert.ok(rows.some((r) => r.id === ruleId));
  });

  it('§124 — tetikleyici koşulları değerlendirir ve aksiyonları GERÇEK çalıştırır', async () => {
    const context = { status: 'DRAFT', contentId: 'test-content-1', brandId: ctx.brandId, title: 'Test içerik' };
    await runTriggers('ContentCreated', `test-entity-${Date.now()}`, { workspaceId: ctx.workspaceId, userId: ctx.userId }, context);
    const executions = await listExecutions(ctx.workspaceId, ruleId, 5);
    assert.ok(executions.length >= 1, 'yürütme kaydı oluşmalı');
    const latest = executions[0];
    assert.equal(latest.status, 'DONE', `beklenen DONE, gelen ${latest.status}${latest.error ? ' — ' + latest.error : ''}`);
    const outputs = (latest.output?.results ?? []) as { type: string; executed: boolean }[];
    assert.ok(outputs.every((r) => r.executed), 'bildirim ve görev aksiyonları gerçek çalışmalı');
    const notif = await prisma.notification.findFirst({ where: { workspaceId: ctx.workspaceId, title: 'AUTO-TEST bildirim' } });
    assert.ok(notif, 'bildirim GERÇEK kayıt olmalı');
    const task = await prisma.notification.findFirst({ where: { workspaceId: ctx.workspaceId, title: 'Görev: AUTO-TEST görev' } });
    assert.ok(task, 'görev kaydı oluşturulmalı');
  });

  it('§124 — koşulsuz eşleşme yürütme SKIPPED olur ve görünür kalır', async () => {
    const context = { status: 'READY', contentId: 'x', brandId: ctx.brandId };
    await runTriggers('ContentCreated', `test-entity-skip-${Date.now()}`, { workspaceId: ctx.workspaceId, userId: ctx.userId }, context);
    const executions = await listExecutions(ctx.workspaceId, ruleId, 3);
    assert.ok(executions.some((e) => e.status === 'SKIPPED' && e.error === 'Koşullar sağlanmadı'), 'atlanan yürütme görünür olmalı');
  });

  it('§139 — döngü koruması aynı tetikleyici için tekrar çalışmayı durdurur', async () => {
    assert.equal(conditionsMatch([{ field: 'status', operator: 'eq', value: 'DRAFT' }], { status: 'DRAFT' }), true);
    const triggerId = `loop-${Date.now()}`;
    const context = { status: 'DRAFT', contentId: 'c', brandId: ctx.brandId };
    await runTriggers('ContentCreated', triggerId, { workspaceId: ctx.workspaceId, userId: ctx.userId }, context);
    await runTriggers('ContentCreated', triggerId, { workspaceId: ctx.workspaceId, userId: ctx.userId }, context);
    const executions = await listExecutions(ctx.workspaceId, ruleId, 10).then((list) => list.filter((e) => e.triggerId === triggerId));
    assert.equal(executions.filter((e) => e.status === 'DONE').length, 1, 'aynı tetikleyici için tek DONE');
    assert.ok(executions.some((e) => e.status === 'SKIPPED' && e.error?.includes('döngü koruması')), 'ikinci çalışma döngü korumasıyla durmalı');
  });

  it('§100 — düzey 1 kural yalnızca öneri üretir, aksiyon çalıştırmaz', async () => {
    const suggestion = await createRule({ workspaceId: ctx.workspaceId, userId: ctx.userId }, {
      name: 'Öneri kuralı',
      trigger: 'PublicationSucceeded',
      conditions: [],
      actions: [{ type: 'send_notification', payload: { title: 'Bu OLMAMALI', message: 'aksiyon çalışmamalı' } }],
      enabled: true,
      autonomyLevel: 1
    });
    assert.ok(suggestion.rule);
    notificationTitles.push('Öneri: Öneri kuralı', 'Bu OLMAMALI');
    await runTriggers('PublicationSucceeded', `sugg-${Date.now()}`, { workspaceId: ctx.workspaceId, userId: ctx.userId }, {});
    const execs = await listExecutions(ctx.workspaceId, suggestion.rule!.id, 3);
    assert.equal(execs[0].status, 'SKIPPED');
    assert.equal((execs[0].output as any)?.suggestionOnly, true);
    const mustNot = await prisma.notification.findFirst({ where: { workspaceId: ctx.workspaceId, title: 'Bu OLMAMALI' } });
    assert.equal(mustNot, null, 'düzey 1 aksiyon bildirimi göndermemeli');
    await deleteRule({ workspaceId: ctx.workspaceId, userId: ctx.userId }, suggestion.rule!.id);
  });

  it('§101 — otomatik yayın aksiyonu motor düzeyinde engellenir, dürüst gerekçe yazar', async () => {
    const rule = await createRule({ workspaceId: ctx.workspaceId, userId: ctx.userId }, {
      name: 'Otomatik yayın denemesi',
      trigger: 'ContentCreated',
      conditions: [],
      actions: [{ type: 'schedule_approved_content' }],
      enabled: true,
      autonomyLevel: 4
    });
    assert.ok(rule.rule);
    await runTriggers('ContentCreated', `autopub-${Date.now()}`, { workspaceId: ctx.workspaceId, userId: ctx.userId }, { status: 'DRAFT', brandId: ctx.brandId });
    const execs = await listExecutions(ctx.workspaceId, rule.rule!.id, 3);
    const results = (execs[0].output?.results ?? []) as { type: string; executed: boolean; detail: string }[];
    const pub = results.find((r) => r.type === 'schedule_approved_content');
    assert.ok(pub);
    assert.equal(pub!.executed, false, 'otomatik yayın çalışmamalı');
    assert.ok(pub!.detail.includes('kapalı'), 'dürüst gerekçe yazılmalı');
    await deleteRule({ workspaceId: ctx.workspaceId, userId: ctx.userId }, rule.rule!.id);
  });

  it('çapraz çalışma alanı kuralı göremez/güncelleyemez', async () => {
    const other = await prisma.workspace.create({
      data: { name: 'TEST-AUTO-WS', slug: `test-auto-ws-${Date.now()}`, plan: 'free', demoMode: true }
    });
    try {
      const otherRules = await listRules(other.id);
      assert.ok(!otherRules.some((r) => r.id === ruleId));
      const updated = await updateRule({ workspaceId: other.id, userId: ctx.userId }, ruleId, { enabled: false });
      assert.equal(updated, null, 'başka çalışma alanı kuralı güncelleyememeli');
    } finally {
      await prisma.workspace.delete({ where: { id: other.id } });
    }
  });

  it('kural silme çalışır ve audit bırakır', async () => {
    const temp = await createRule({ workspaceId: ctx.workspaceId, userId: ctx.userId }, {
      name: 'Silinecek kural',
      trigger: 'ContentRejected',
      conditions: [],
      actions: [{ type: 'send_notification', payload: { title: 't', message: 'm' } }]
    });
    const deleted = await deleteRule({ workspaceId: ctx.workspaceId, userId: ctx.userId }, temp.rule!.id);
    assert.equal(deleted, true);
    const auditRow = await prisma.auditLog.findFirst({ where: { workspaceId: ctx.workspaceId, action: 'automation.rule.deleted', entityId: temp.rule!.id } });
    assert.ok(auditRow);
  });
});
