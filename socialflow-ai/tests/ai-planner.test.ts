/**
 * AI Planlayıcı (Faz 4 §80-§85, §123, §137, §138)
 * ---------------------------------------------------------------------------
 * - Plan üretimi GERÇEK ContentPlan/ContentPlanItem kayıtları açar.
 * - Yapılandırılmış çıktı doğrulanır; geçersiz platform/hashtag elenir.
 * - Belirgin tekrar konular ele yeni üretilir (§84).
 * - "Takvime Ekle" TASLAK içerik açar; asla yayın/zamanlama oluşturmaz (§83/§138).
 * - Çapraz çalışma alanı plan öğesine erişemez.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../src/lib/prisma';
import { getSeedContext, type SeedContext } from './helpers';
import { generateContentPlan, applyPlanItem, listPlans } from '../src/lib/planner/service';

function isoIn(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

describe('AI Planlayıcı: plan üretimi, tekrar önleme, Takvime Ekle, izolasyon', () => {
  let ctx: SeedContext;
  let planId: string;
  const contentIds: string[] = [];

  before(async () => {
    ctx = await getSeedContext();
  });

  after(async () => {
    await prisma.content.deleteMany({ where: { id: { in: contentIds } } });
    if (planId) await prisma.contentPlan.deleteMany({ where: { id: planId } });
  });

  it('§137 — plan + öğeler GERÇEK kayıt olarak oluşur; yapılandırılmış kavramlar taşır', async () => {
    const result = await generateContentPlan(
      {
        brandId: ctx.brandId,
        platforms: ['INSTAGRAM', 'LINKEDIN'],
        dateFrom: isoIn(1),
        dateTo: isoIn(30),
        goal: 'Test lansmanı',
        frequency: '3 / hafta'
      },
      { workspaceId: ctx.workspaceId, userId: ctx.userId }
    );
    planId = result.planId;
    assert.ok(planId);
    const dbPlan = await prisma.contentPlan.findUnique({ where: { id: planId }, include: { items: true } });
    assert.ok(dbPlan);
    assert.equal(dbPlan.status, 'DRAFT');
    assert.ok(dbPlan.items.length >= 3, 'en az birkaç öğe üretilmeli');
    for (const item of dbPlan.items) {
      assert.ok(item.headline, 'her öğe başlık kavramı içermeli');
      assert.ok(item.platform === 'INSTAGRAM' || item.platform === 'LINKEDIN');
      assert.equal(item.status, 'PLANNED');
      // Hashtagler yalnızca kitte onaylı olabilir (uydurma yok) — boş dizi de meşrudur
      const tags = JSON.parse(item.hashtags) as string[];
      assert.ok(Array.isArray(tags));
    }
    assert.ok(['ai', 'deterministic'].includes(result.engine));
    assert.ok(result.engineLabel.length > 3);
    assert.ok(['RECENT_HISTORY', 'INSUFFICIENT_HISTORY'].includes(result.dataBasis));
  });

  it('§84 — aynı istekte tekrar konular ele yeni üretilir', async () => {
    const result = await generateContentPlan(
      {
        brandId: ctx.brandId,
        platforms: ['INSTAGRAM'],
        dateFrom: isoIn(1),
        dateTo: isoIn(90),
        goal: null,
        frequency: 'Her gün'
      },
      { workspaceId: ctx.workspaceId, userId: ctx.userId }
    );
    const keys = result.items.map((i) => `${i.topic}|${i.headline}`.toLowerCase());
    assert.equal(new Set(keys).size, keys.length, 'aynı plan içinde yinelenen konu/başlık olmamalı');
    await prisma.contentPlan.delete({ where: { id: result.planId } });
  });

  it('§138 — Takvime Ekle TASLAK içerik açar; yayın/zamanlama OLUŞTURMAZ', async () => {
    const plan = await prisma.contentPlan.findUnique({ where: { id: planId }, include: { items: { take: 1 } } });
    const item = plan!.items[0];
    const res = await applyPlanItem({ workspaceId: ctx.workspaceId, userId: ctx.userId, itemId: item.id });
    assert.ok(res);
    assert.equal(res!.alreadyApplied, false);
    contentIds.push(res!.contentId);

    const content = await prisma.content.findUnique({ where: { id: res!.contentId } });
    assert.equal(content!.status, 'DRAFT', 'içerik taslak olmalı');
    assert.equal(content!.scheduledFor, null, 'zamanlama oluşturulmamalı');
    const pubs = await prisma.publication.count({ where: { contentId: content!.id } });
    assert.equal(pubs, 0, 'yayın kaydı oluşmamalı');

    const updatedItem = await prisma.contentPlanItem.findUnique({ where: { id: item.id } });
    assert.equal(updatedItem!.status, 'CREATED');
    assert.equal(updatedItem!.contentId, res!.contentId);

    // İkinci uygulama idempotent: aynı içeriğe bağlanır, kopya açmaz
    const again = await applyPlanItem({ workspaceId: ctx.workspaceId, userId: ctx.userId, itemId: item.id });
    assert.equal(again!.alreadyApplied, true);
    const total = await prisma.content.count({ where: { id: { in: [res!.contentId] } } });
    assert.equal(total, 1);
  });

  it('§140 — başka çalışma alanı plan öğesine Takvime Ekle yapamaz', async () => {
    const plan = await prisma.contentPlan.findUnique({ where: { id: planId }, include: { items: { skip: 1, take: 1 } } });
    const item = plan!.items[0];
    const other = await prisma.workspace.create({
      data: { name: 'TEST-PLANNER-WS', slug: `test-planner-ws-${Date.now()}`, plan: 'free', demoMode: true }
    });
    try {
      const res = await applyPlanItem({ workspaceId: other.id, userId: ctx.userId, itemId: item.id });
      assert.equal(res, null, 'çapraz çalışma alanı erişimi reddedilmeli');
    } finally {
      await prisma.workspace.delete({ where: { id: other.id } });
    }
  });

  it('listPlans yalnızca kendi çalışma alanının planlarını döner', async () => {
    const plans = await listPlans(ctx.workspaceId);
    assert.ok(plans.some((p) => p.id === planId));
    const other = await prisma.workspace.create({
      data: { name: 'TEST-PLANNER-WS2', slug: `test-planner-ws2-${Date.now()}`, plan: 'free', demoMode: true }
    });
    try {
      const otherPlans = await listPlans(other.id);
      assert.ok(!otherPlans.some((p) => p.id === planId));
    } finally {
      await prisma.workspace.delete({ where: { id: other.id } });
    }
  });
});
