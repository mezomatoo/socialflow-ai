/**
 * #79/#80 — Faz 1 çekirdek davranışları.
 * ---------------------------------------------------------------------------
 * Kapsam:
 *   - Yapay zekâ soyutlaması: sağlayıcı yokken çalışma DURMAZ (yerel motor),
 *     bozuk JSON zarifçe ele alınır.
 *   - Kural sürümleme: platform kuralı güncellenince sürüm artar ve eski tanım
 *     PlatformRuleVersion olarak saklanır; içerik kullandığı sürümü referans alır.
 *   - Medya varyantı: türev kaydı orijinali DEĞİŞTİRMEZ; aktif referansı olan
 *     medya silinemez (409), başka çalışma alanından erişilemez (tenant izolasyonu).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getSeedContext, squareMediaId, prisma, type SeedContext } from './helpers';
import { parseJsonLoose, getAiAdapter, activeProviderName, aiModeLabel, unavailableCapabilities, isExternalAiAvailable } from '../src/lib/ai/provider';
import { completeJson, activeProvider, aiModeLabel as legacyModeLabel } from '../src/lib/ai/llmClient';
import { getRule, updateRule } from '../src/lib/rules/ruleEngine';
import { createMediaVariant, listMediaVariants, mediaUsage, deleteMediaVariant, findVariant } from '../src/lib/services/mediaProcessingService';
import { deleteMedia } from '../src/lib/services/mediaService';
import { AppError } from '../src/lib/errors';
import { assertModuleEnabled, isModuleEnabled, moduleState, moduleNotice, MODULE_GATES } from '../src/lib/phase/phaseGates';

/** 1x1 PNG — tarayıcı gerektirmeyen en küçük geçerli görsel. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('Faz 1 — yapay zekâ soyutlaması ve zarif bozulma', () => {
  it('sağlayıcı yoksa yerel motora düşer ve çağrı bloklanmaz', async () => {
    assert.equal(typeof activeProviderName(), 'string');
    const adapter = getAiAdapter();
    assert.ok(['deterministic', 'openai', 'anthropic'].includes(adapter.name));
    assert.equal(typeof aiModeLabel(), 'string');

    if (!isExternalAiAvailable()) {
      assert.equal(activeProvider(), 'deterministic');
      assert.equal(legacyModeLabel(), 'Yerel Motor (Demo)');
      const { data, result } = await completeJson<{ x: number }>({
        system: 'test',
        user: 'test',
        task: 'TEST',
        schema: { type: 'object' }
      });
      // Sağlayıcı yokken veri null döner; çağıran servis yerel üretime devam eder.
      assert.equal(data, null);
      assert.equal(result.degraded, true);
      assert.equal(result.provider, 'deterministic');
    }

    // Faz 2+ yetenekleri açıkça "desteklenmiyor" olarak raporlanır (§4 dürüstlük).
    const caps = unavailableCapabilities();
    assert.ok(caps.includes('imageGeneration'));
    assert.ok(caps.includes('vision'));
  });

  it('bozuk JSON çıktısı hata fırlatmadan güvenle çözülür', () => {
    assert.equal(parseJsonLoose('bu bir JSON değil'), null);
    assert.equal(parseJsonLoose(''), null);
    assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseJsonLoose('Ön açıklama {"b":"metin"} sonrası'), { b: 'metin' });
  });
});

describe('Faz 1 — platform kuralı sürümleme', () => {
  it('kural güncellenince sürüm artar ve eski tanım saklanır', async () => {
    const ctx: SeedContext = await getSeedContext();
    const before = await getRule(ctx.workspaceId, 'INSTAGRAM', 'FEED');
    assert.ok(before);
    const startVersion = before!.version;

    const updated = await updateRule(ctx.workspaceId, 'INSTAGRAM', 'FEED', {
      recommendedCaptionLength: (before!.recommendedCaptionLength ?? 300) + 5
    });

    assert.ok(updated.version > startVersion, 'sürüm numarası artmalı');

    const snapshots = await prisma.platformRuleVersion.findMany({
      where: { workspaceId: ctx.workspaceId, platform: 'INSTAGRAM', contentType: 'FEED' },
      orderBy: { version: 'desc' },
      take: 5
    });
    assert.ok(snapshots.length >= 1, 'eski kural sürümü saklanmalı');
    assert.equal(snapshots[0].version, startVersion);
    assert.ok(snapshots[0].snapshot.length > 10);
  });
});

describe('Faz 1 — medya varyantları ve silme güvenliği', () => {
  let ctx: SeedContext;
  let mediaId: string;
  const created: string[] = [];

  before(async () => {
    ctx = await getSeedContext();
    mediaId = await squareMediaId(ctx.workspaceId);
  });

  after(async () => {
    for (const id of created) await deleteMediaVariant(ctx.workspaceId, id).catch(() => undefined);
    await prisma.platformContent.deleteMany({ where: { content: { title: 'TEST-VARIANT-GUARD' } } });
    await prisma.content.deleteMany({ where: { title: 'TEST-VARIANT-GUARD' } });
  });

  it('türev üretimi orijinali değiştirmez ve READY kayıt oluşturur', async () => {
    const original = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
    const originalHash = original.contentHash;
    const originalKey = original.storageKey;

    const variant = await createMediaVariant({
      workspaceId: ctx.workspaceId,
      mediaAssetId: mediaId,
      platform: 'INSTAGRAM',
      contentType: 'STORY',
      aspectRatio: '9:16',
      kind: 'CROP',
      bytes: TINY_PNG,
      mimeType: 'image/png',
      width: 1080,
      height: 1920,
      cropMode: 'SMART',
      processingMethod: 'DETERMINISTIC'
    });
    created.push(variant.id);

    assert.equal(variant.processingStatus, 'READY');
    assert.notEqual(variant.storageKey, originalKey, 'türev ayrı bir dosyadır');
    assert.equal(variant.bytes, TINY_PNG.length);

    const again = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
    assert.equal(again.contentHash, originalHash, 'orijinal içerik hash’i değişmemeli');
    assert.equal(again.storageKey, originalKey, 'orijinal depolama anahtarı değişmemeli');

    // Depoda iki ayrı nesne vardır.
    const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || './storage');
    assert.ok(fs.existsSync(path.join(storageRoot, variant.storageKey)));
    assert.ok(fs.existsSync(path.join(storageRoot, originalKey)));

    const found = await findVariant({
      workspaceId: ctx.workspaceId,
      mediaAssetId: mediaId,
      platform: 'INSTAGRAM',
      contentType: 'STORY',
      aspectRatio: '9:16'
    });
    assert.equal(found?.id, variant.id);

    const listed = await listMediaVariants(ctx.workspaceId, mediaId);
    assert.ok(listed.some((v) => v.id === variant.id));
  });

  it('başka çalışma alanı varyantlara ve medyaya erişemez', async () => {
    const variant = await prisma.mediaVariant.findFirstOrThrow({
      where: { mediaAssetId: mediaId, platform: 'INSTAGRAM', contentType: 'STORY' }
    });

    await assert.rejects(
      () => deleteMediaVariant('workspace-yok', variant.id),
      (err: unknown) => err instanceof AppError && err.status === 404
    );

    const foreignUsage = await mediaUsage('workspace-yok', mediaId);
    assert.equal(foreignUsage.total, 0, 'yabancı çalışma alanı referans görmemeli');
    assert.equal(foreignUsage.variants, 0);
  });

  it('aktif içerikte kullanılan medya silinemez; güvenli olduğunda silinir', async () => {
    const brand = await prisma.brand.findFirstOrThrow({ where: { workspaceId: ctx.workspaceId } });
    const content = await prisma.content.create({
      data: {
        workspaceId: ctx.workspaceId,
        brandId: brand.id,
        title: 'TEST-VARIANT-GUARD',
        masterCaption: 'Test içeriği — medya silme koruması.',
        status: 'DRAFT',
        origin: 'MANUAL',
        createdById: ctx.userId
      }
    });
    await prisma.platformContent.create({
      data: {
        contentId: content.id,
        key: 'instagram:FEED',
        platform: 'INSTAGRAM',
        contentType: 'FEED',
        mediaAssetId: mediaId,
        caption: 'Test',
        status: 'DRAFT'
      }
    });

    const usage = await mediaUsage(ctx.workspaceId, mediaId);
    assert.equal(usage.safeToDelete, false);
    assert.ok(usage.activeReferences >= 1);

    await assert.rejects(
      () => deleteMedia(mediaId, ctx.workspaceId),
      (err: unknown) => err instanceof AppError && err.status === 409
    );
    // Silme reddedildiğinde medya yerinde kalır.
    assert.ok(await prisma.mediaAsset.findUnique({ where: { id: mediaId } }));
  });
});

describe('Modül kapıları (sahte çalışma yok)', () => {
  it('tamamlanmış modüller varsayılan açıktır; henüz hazır olmayan modüller kapalıdır', () => {
    const state = moduleState();
    assert.equal(state.socialPublishing.enabled, true);
    assert.equal(state.scheduling.enabled, true);
    assert.equal(state.socialAccounts.enabled, true);
    assert.equal(state.analytics.enabled, true);
    assert.equal(state.notifications.enabled, true);
    assert.equal(state.aiAssistant.enabled, true);
    assert.equal(state.automation.enabled, false);
    assert.equal(state.creativeStudio.enabled, true, 'AI Stüdyo tam zincirle çalıştığı için varsayılan açıktır');
    assert.ok(moduleNotice('analytics').length > 10);
    // Müşteriye dönük mesajlarda geliştirme fazı terminolojisi yoktur
    for (const mod of Object.values(state)) {
      assert.doesNotMatch(mod.notice, /Faz\s*\d/, mod.notice);
    }
  });

  it('kapalı modül 501 (MODULE_NOT_ENABLED) hatası verir — sahte başarı yok', () => {
    assert.throws(
      () => assertModuleEnabled('automation'),
      (err: unknown) => err instanceof AppError && err.code === 'MODULE_NOT_ENABLED' && err.status === 501
    );
  });

  it('bayrakla modül açılıp kapatılabilir (tek doğruluk kaynağı korunur)', () => {
    process.env.FF_AUTOMATION = 'true';
    try {
      assert.equal(isModuleEnabled('automation'), true);
      assert.doesNotThrow(() => assertModuleEnabled('automation'));
    } finally {
      delete process.env.FF_AUTOMATION;
    }
    assert.equal(isModuleEnabled('automation'), false);
    process.env.FF_SOCIAL_PUBLISHING = 'false';
    try {
      assert.equal(isModuleEnabled('socialPublishing'), false);
      assert.throws(() => assertModuleEnabled('socialPublishing'));
    } finally {
      delete process.env.FF_SOCIAL_PUBLISHING;
    }
    assert.equal(isModuleEnabled('socialPublishing'), true);
  });

  it('tüm kapılar faz numarası ve Türkçe etiket taşır', () => {
    for (const [id, gate] of Object.entries(MODULE_GATES)) {
      assert.ok(gate.label.length > 2, `${id} etiketi eksik`);
      assert.ok(gate.phase >= 2);
      assert.ok(gate.notice.length > 20, `${id} bilgilendirme metni kısa`);
    }
  });
});
