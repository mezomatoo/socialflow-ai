/**
 * AI Kampanya Oluşturucu (Faz 4 §86-§87)
 * ---------------------------------------------------------------------------
 * - Konsept üretimi marka kitine dayanır; fiyat/kupon/tarih UYDURULMAZ (§78):
 *   kullanıcı gerçeklerini içermeyen çıktıda kampanya koşulu görünmez.
 * - "Kampanyayı Sisteme Kaydet" GERÇEK Campaign kaydı açar (ikinci kampanya
 *   sistemi yoktur — §86) ve audit yazar.
 * - Ürün/teklif (CampaignOffer/Product) modülü KULLANILMAZ (§10/§12/§87).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import prisma from '../src/lib/prisma';
import { getSeedContext, type SeedContext } from './helpers';
import { generateCampaignConcept, createCampaignFromConcept } from '../src/lib/campaign/aiCampaign';

function isoIn(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

describe('AI Kampanya Oluşturucu: konsept, gerçek Campaign kaydı, ürün/teklif yasağı', () => {
  let ctx: SeedContext;
  let campaignId: string;

  before(async () => {
    ctx = await getSeedContext();
  });

  after(async () => {
    if (campaignId) await prisma.campaign.deleteMany({ where: { id: campaignId } });
  });

  it('sahte ürün/teklif kataloğu sistemden kaldırıldı', () => {
    assert.equal(existsSync('src/lib/products/catalog.ts'), false, 'CampaignOffer/Product mock kataloğu olmamalı');
  });

  it('§78 — kullanıcı gerçek bilgisi olmadan fiyat/koşul uydurmaz', async () => {
    const concept = await generateCampaignConcept(
      {
        brandId: ctx.brandId,
        goal: 'Test lansmanı',
        startDate: isoIn(1),
        endDate: isoIn(21),
        platforms: ['INSTAGRAM', 'LINKEDIN'],
        userFacts: null
      },
      { workspaceId: ctx.workspaceId, userId: ctx.userId }
    );
    assert.ok(concept.keyMessage);
    assert.ok(!/\d+\s*(TL|₺)/.test(concept.keyMessage), 'kaynak olmadan fiyat üretilmemeli');
    assert.ok(!/%\s?\d+\s*indirim/i.test(concept.keyMessage), 'kaynak olmadan indirim üretilmemeli');
    assert.equal(concept.engine === 'ai' || concept.engine === 'deterministic', true);
  });

  it('§78 — kullanıcı gerçekleri aynen taşınır (%20 indirim / tarih korunur)', async () => {
    const concept = await generateCampaignConcept(
      {
        brandId: ctx.brandId,
        goal: 'Test lansmanı',
        startDate: isoIn(1),
        endDate: isoIn(21),
        platforms: ['INSTAGRAM'],
        userFacts: '%20 indirim, 20.09.2026 tarihine kadar geçerli'
      },
      { workspaceId: ctx.workspaceId, userId: ctx.userId }
    );
    assert.ok(concept.keyMessage.includes('%20'), 'kullanıcı gerçekleri korunmalı');
    assert.ok(concept.keyMessage.includes('20.09.2026'), 'kullanıcı tarih gerçekleri korunmalı');
  });

  it('§86 — konsept GERÇEK Campaign kaydına dönüşür (mevcut sistem)', async () => {
    const concept = await generateCampaignConcept(
      {
        brandId: ctx.brandId,
        goal: 'Kayıt testi',
        name: 'Test AI Kampanyası',
        startDate: isoIn(1),
        endDate: isoIn(14),
        platforms: ['X'],
        userFacts: null
      },
      { workspaceId: ctx.workspaceId, userId: ctx.userId }
    );
    const campaign = await createCampaignFromConcept(
      { brandId: ctx.brandId, goal: 'Kayıt testi', name: 'Test AI Kampanyası', startDate: isoIn(1), endDate: isoIn(14), platforms: ['X'] },
      concept,
      { workspaceId: ctx.workspaceId, userId: ctx.userId }
    );
    campaignId = campaign.id;
    const row = await prisma.campaign.findFirst({ where: { id: campaign.id, workspaceId: ctx.workspaceId } });
    assert.ok(row, 'kampanya kendi çalışma alanında kayıtlı olmalı');
    assert.equal(row!.name, 'Test AI Kampanyası');
    assert.ok(row!.code.length > 0);
    const notes = JSON.parse(row!.notes ?? '{}') as { engine?: string };
    assert.ok(['ai', 'deterministic'].includes(notes.engine ?? ''));

    const auditRow = await prisma.auditLog.findFirst({ where: { workspaceId: ctx.workspaceId, action: 'ai.campaign.created', entityId: campaign.id } });
    assert.ok(auditRow, 'audit kaydı yazılmalı');

    // Tekrar oluşturma aynı koddan çakışma yaratmaz (benzersiz kod üretilir)
    const second = await createCampaignFromConcept(
      { brandId: ctx.brandId, goal: 'Kayıt testi', name: 'Test AI Kampanyası', startDate: isoIn(1), endDate: isoIn(14), platforms: ['X'] },
      concept,
      { workspaceId: ctx.workspaceId, userId: ctx.userId }
    );
    assert.notEqual(second.code, campaign.code, 'kod benzersiz olmalı');
    await prisma.campaign.delete({ where: { id: second.id } });
  });

  it('§140 — başka çalışma alanı adına kampanya oluşturulamaz', async () => {
    const other = await prisma.workspace.create({
      data: { name: 'TEST-CAMP-WS', slug: `test-camp-ws-${Date.now()}`, plan: 'free', demoMode: true }
    });
    try {
      await assert.rejects(
        () =>
          generateCampaignConcept(
            { brandId: ctx.brandId, goal: 'X', startDate: isoIn(1), endDate: isoIn(2), platforms: ['X'] },
            { workspaceId: other.id, userId: ctx.userId }
          ),
        /Marka bulunamadı/,
        'çapraz çalışma alanı markası reddedilmeli'
      );
    } finally {
      await prisma.workspace.delete({ where: { id: other.id } });
    }
  });
});
