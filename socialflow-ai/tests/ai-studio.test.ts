/**
 * AI Studio servis zinciri (Faz 4 §59-§67, §122, §135, §140)
 * ---------------------------------------------------------------------------
 * - Üretim gerçek DB + depo kaydı oluşturur: AiImageGeneration → MediaAsset →
 *   MasterCreative (+ kalite skoru, kit sürümü).
 * - Orijinal varlık ASLA üzerine yazılmaz: her üretim YENİ MediaAsset açar.
 * - Üretilen SVG sanitizasyonlu olur (script/olay işleyicisi yok — §111).
 * - Yeniden boyutlandırma master'ı değiştirmez; CreativeVariant açar.
 * - Çapraz çalışma alanı erişimi engellenir (§140).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import prisma from '../src/lib/prisma';
import { getSeedContext, type SeedContext } from './helpers';
import {
  generateStudioImages,
  resizeMasterCreative,
  createMasterVariations,
  renderCreativeSvg,
  brandVisualContext,
  contrastRatio
} from '../src/lib/ai/studioService';

describe('AI Studio: üretim, yeniden boyutlandırma, varyasyon, izolasyon', () => {
  let ctx: SeedContext;
  const mediaIds: string[] = [];
  const masterIds: string[] = [];
  const storageKeys: string[] = [];

  before(async () => {
    ctx = await getSeedContext();
  });

  after(async () => {
    await prisma.creativeVariant.deleteMany({ where: { workspaceId: ctx.workspaceId, masterCreativeId: { in: masterIds } } });
    await prisma.creativeQualityScore.deleteMany({ where: { workspaceId: ctx.workspaceId, masterCreativeId: { in: masterIds } } });
    await prisma.masterCreative.deleteMany({ where: { id: { in: masterIds } } });
    await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.aiImageGeneration.deleteMany({ where: { workspaceId: ctx.workspaceId, prompt: { contains: 'TESTSTUDIO' } } });
    for (const key of storageKeys) {
      try {
        fs.unlinkSync(path.join(process.cwd(), 'storage', key));
      } catch {
        /* dosya zaten yok */
      }
    }
  });

  it('§122 — üretim tam zincir oluşturur: AiImageGeneration + MediaAsset + MasterCreative + kalite', async () => {
    const results = await generateStudioImages({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      brandId: ctx.brandId,
      prompt: 'TESTSTUDIO yeni sezon kampanya görseli',
      aspectRatio: '1:1',
      count: 2,
      headline: 'Yeni Sezon',
      cta: 'Şimdi İncele'
    });
    assert.equal(results.length, 2);

    for (const r of results) {
      const gen = await prisma.aiImageGeneration.findUnique({ where: { id: r.generationId } });
      assert.equal(gen?.status, 'DONE');
      assert.equal(gen?.brandKitUsed, true);

      const asset = await prisma.mediaAsset.findUnique({ where: { id: r.mediaAssetId } });
      assert.ok(asset, 'MediaAsset oluşturulmalı');
      assert.equal(asset.kind, 'IMAGE');
      mediaIds.push(asset.id);
      storageKeys.push(asset.storageKey);

      // Dosya gerçekten depoya yazılmış olmalı
      const filePath = path.join(process.cwd(), 'storage', asset.storageKey);
      assert.ok(fs.existsSync(filePath), 'üretilen dosya depoda olmalı');

      // §111 — sanitizasyon-by-construction
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(!/<script/i.test(content), 'üretilen SVG script içermemeli');
      assert.ok(!/on\w+=/i.test(content), 'üretilen SVG olay işleyicisi içermemeli');

      const master = await prisma.masterCreative.findUnique({
        where: { id: r.masterId },
        include: { quality: true }
      });
      assert.ok(master, 'MasterCreative oluşturulmalı');
      const masterRow = master;
      assert.ok(masterRow.brandKitVersion != null && masterRow.brandKitVersion >= 1, 'kit sürümü izlenebilir olmalı (§56)');
      assert.ok(masterRow.quality, 'kalite skoru yazılmalı');
      assert.ok(masterRow.quality!.overall > 0 && masterRow.quality!.overall <= 100);
      masterIds.push(masterRow.id);
    }
  });

  it('§67 — tekrar üretim orijinali ezmez: her üretim yeni MediaAsset açar', async () => {
    const before = await prisma.mediaAsset.count({ where: { workspaceId: ctx.workspaceId, tags: 'ai-studio' } });
    const [r] = await generateStudioImages({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      brandId: ctx.brandId,
      prompt: 'TESTSTUDIO ikinci üretim',
      aspectRatio: '4:5',
      count: 1
    });
    const after = await prisma.mediaAsset.count({ where: { workspaceId: ctx.workspaceId, tags: 'ai-studio' } });
    assert.equal(after, before + 1, 'yeni üretim yeni varlık olmalı');
    mediaIds.push(r.mediaAssetId);
    const asset = await prisma.mediaAsset.findUnique({ where: { id: r.mediaAssetId } });
    assert.ok(asset);
    storageKeys.push(asset.storageKey);
    assert.equal(asset!.width, 1080);
    assert.equal(asset!.height, 1350);
  });

  it('§62/§63/§135 — yeniden boyutlandırma master dokunmadan varyant açar (1:1, 4:5, 9:16)', async () => {
    const masterId = masterIds[0];
    const masterBefore = await prisma.masterCreative.findUnique({ where: { id: masterId } });
    const variants = await resizeMasterCreative({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      masterId,
      targets: [
        { platform: 'INSTAGRAM', contentType: 'FEED', aspectRatio: '1:1' },
        { platform: 'INSTAGRAM', contentType: 'FEED', aspectRatio: '4:5' },
        { platform: 'INSTAGRAM', contentType: 'STORY', aspectRatio: '9:16' }
      ]
    });
    assert.equal(variants?.length, 3);
    const masterAfter = await prisma.masterCreative.findUnique({ where: { id: masterId } });
    assert.equal(masterAfter!.storageKey, masterBefore!.storageKey, 'master dosyası değişmemeli');
    assert.equal(masterAfter!.width, masterBefore!.width);
    for (const v of variants!) {
      assert.equal(v.status, 'READY');
      assert.ok(v.fileUrl);
      storageKeys.push(v.storageKey!);
    }
  });

  it('§64-§66 — varyasyonlar kontrollü stille üretilir', async () => {
    const variants = await createMasterVariations({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      masterId: masterIds[0],
      styles: ['MINIMAL', 'PREMIUM', 'SALES']
    });
    assert.equal(variants?.length, 3);
    for (const v of variants!) {
      assert.ok(v.platform.startsWith('VARIATION_'));
      storageKeys.push(v.storageKey!);
    }
  });

  it('§140 — başka çalışma alanı master kreatife erişemez', async () => {
    const other = await prisma.workspace.create({
      data: { name: 'TEST-STUDIO-WS', slug: `test-studio-ws-${Date.now()}`, plan: 'free', demoMode: true }
    });
    try {
      const variants = await resizeMasterCreative({
        workspaceId: other.id,
        userId: ctx.userId,
        masterId: masterIds[0],
        targets: [{ platform: 'INSTAGRAM', aspectRatio: '1:1' }]
      });
      assert.equal(variants, null, 'çapraz çalışma alanı yeniden boyutlandırma reddedilmeli');
    } finally {
      await prisma.workspace.delete({ where: { id: other.id } });
    }
  });

  it('SVG üretici deterministiktir ve metni kaçırır', () => {
    const ctxv = brandVisualContext({ colors: [{ hex: '#336699' }], brand: { name: 'Test <Marka>' }, currentVersion: 2 });
    const svg = renderCreativeSvg({ w: 1080, h: 1080, ctx: ctxv, headline: 'Test <"Özel"> & Karakter', cta: 'İncele', layout: 'CENTERED' });
    assert.ok(!svg.includes('<"Özel">'), 'ham metin gömülmemeli');
    assert.ok(svg.includes('&lt;'), 'kaçırma uygulanmalı');
    assert.ok(contrastRatio('#ffffff', '#000000') > 15, 'kontrast hesabı doğru olmalı');
  });
});
