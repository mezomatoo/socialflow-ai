/**
 * AI platform katmanı (Faz 4 §54, §57, §58)
 * ---------------------------------------------------------------------------
 * - AiUsage GERÇEK veritabanına yazılır ve çalışma alanı izolasyonu ile okunur.
 * - PromptTemplate tek doğruluk kaynağı DB'dir; DB boşken kod içi varsayılana
 *   dürüstçe düşer (kaynak 'fallback' etiketli).
 * - AiFeedback kayıtları çalışma alanına yazılır.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prisma from '../src/lib/prisma';
import { getSeedContext, type SeedContext } from './helpers';
import { trackUsage, getUsageSummary, estimateTokens } from '../src/lib/ai/usage';
import { getTemplate, ensureDefaultTemplates, renderTemplate, validateOutput } from '../src/lib/ai/promptTemplates';

describe('AI platform katmanı: kullanım, şablon, geri bildirim', () => {
  let ctx: SeedContext;
  const trackedIds: string[] = [];

  before(async () => {
    ctx = await getSeedContext();
  });

  after(async () => {
    await prisma.aiUsage.deleteMany({ where: { id: { in: trackedIds } } });
    await prisma.aiFeedback.deleteMany({ where: { workspaceId: ctx.workspaceId, note: 'TEST-FEEDBACK' } });
    await prisma.promptTemplate.deleteMany({ where: { service: 'testService' } });
  });

  it('§57 — trackUsage kalıcı AiUsage kaydı yazar; özet gerçek kayıttan hesaplanır', async () => {
    await trackUsage({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      brandId: ctx.brandId,
      provider: 'deterministic',
      service: 'textGeneration',
      task: 'unit-test',
      tokensIn: 100,
      tokensOut: 50,
      durationMs: 12,
      costUSD: 0
    });
    const row = await prisma.aiUsage.findFirst({ where: { workspaceId: ctx.workspaceId, task: 'unit-test' } });
    assert.ok(row, 'kullanım kaydı veritabanına yazılmalı');
    trackedIds.push(row.id);

    const summary = await getUsageSummary(ctx.workspaceId, 'month');
    const mine = summary.records.find((r) => r.task === 'unit-test');
    assert.ok(mine, 'özet kendi çalışma alanının kaydını içermeli');
    assert.equal(mine!.tokensIn + mine!.tokensOut, 150);
    assert.equal(mine!.costUSD, 0, 'yerel motor maliyeti 0 olmalı');
  });

  it('§57/§141 — kullanım özeti çalışma alanı izolasyonludur', async () => {
    const other = await prisma.workspace.create({
      data: { name: 'TEST-BAŞKA-WS', slug: `test-baska-ws-${Date.now()}`, plan: 'free', demoMode: true }
    });
    try {
      await trackUsage({ workspaceId: other.id, provider: 'openai', service: 'textGeneration', task: 'other-ws', tokensIn: 999 });
      const mySummary = await getUsageSummary(ctx.workspaceId, 'month');
      assert.ok(!mySummary.records.some((r) => r.task === 'other-ws'), 'başka çalışma alanının kaydı görünmemeli');
    } finally {
      await prisma.aiUsage.deleteMany({ where: { workspaceId: other.id } });
      await prisma.workspace.delete({ where: { id: other.id } });
    }
  });

  it('§54 — şablon varsayılanı DB boşken fallback olarak döner ve kaynak etiketi taşır', async () => {
    const tpl = await getTemplate('captionGeneration');
    assert.ok(tpl);
    assert.ok(['db', 'fallback'].includes(tpl!.source));
    assert.ok(tpl!.template.includes('{{brandName}}'));
  });

  it('§54 — ensureDefaultTemplates idempotent tohumlama yapar; sonrasında kaynak db olur', async () => {
    await ensureDefaultTemplates();
    await ensureDefaultTemplates(); // ikinci çağrı kopya oluşturmaz
    const rows = await prisma.promptTemplate.findMany({ where: { service: 'captionGeneration', version: '1.0' } });
    assert.equal(rows.length, 1, 'aynı service+version için tek kayıt olmalı');
    const tpl = await getTemplate('captionGeneration');
    assert.equal(tpl!.source, 'db');
  });

  it('§54/§55 — şablon değişkenleri işlenir ve çıktı şemaya göre doğrulanır', () => {
    const rendered = renderTemplate('Marka: {{brandName}} / Konu: {{topic}}', { brandName: 'Kahve', topic: 'demleme' });
    assert.equal(rendered, 'Marka: Kahve / Konu: demleme');
    const schema = { type: 'object', properties: { caption: {} }, required: ['caption'] };
    assert.ok(validateOutput<{ caption: string }>(schema, { caption: 'merhaba' }));
    assert.equal(validateOutput<{ caption: string }>(schema, { wrong: 1 }), null, 'eksik zorunlu alan reddedilmeli');
  });

  it('§58 — AiFeedback kaydı çalışma alanına yazılır ve silinir', async () => {
    const fb = await prisma.aiFeedback.create({
      data: {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        brandId: ctx.brandId,
        service: 'captionGeneration',
        rating: 'LIKED',
        note: 'TEST-FEEDBACK'
      }
    });
    assert.ok(fb.id);
    const count = await prisma.aiFeedback.count({ where: { workspaceId: ctx.workspaceId, rating: 'LIKED', note: 'TEST-FEEDBACK' } });
    assert.equal(count, 1);
  });

  it('belirteç tahmini deterministik ve pozitiftir', () => {
    assert.equal(estimateTokens(''), 1);
    assert.equal(estimateTokens('abcd'.repeat(10)), 10);
  });
});
