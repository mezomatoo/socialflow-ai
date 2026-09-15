/**
 * §57 — Kiracı izolasyonu süpürme testi (Faz 1).
 * ---------------------------------------------------------------------------
 * Faz 1 denetiminde bulunan ve kapatılan çapraz çalışma alanı erişimleri:
 *   1. adaptContentToPlatforms: içerik workspaceId ile SORGULANMIYORDU →
 *      yabancı içeriğin hedeflerine AI uyarlaması yazılabiliyordu.
 *   2. syncSelections: içerik sahipliği doğrulanmıyordu + hesap seçimi yabancı
 *      sosyal hesap kimliği taşıyabiliyordu.
 *   3. updateFocalPoint: mediaId ile güncelliyor, workspaceId'yi yok sayıyordu.
 *   4. Platform içeriği düzenleme: medya/hesap kimlikleri kiracıya ait mi?
 * Bu testler, kuralın WHERE cümlesinde uygulandığını (sonradan karşılaştırma
 * DEĞİL) ve yabancı kimliklerin içeriğe BAĞLANMADIĞINI kanıtlar.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getSeedContext, prisma, type SeedContext } from './helpers';
import {
  createContent,
  syncSelections,
  adaptContentToPlatforms,
  ownedAccountId
} from '../src/lib/services/contentService';
import { updateFocalPoint } from '../src/lib/services/mediaService';

const FOREIGN_WS = 'baska-bir-calisma-alani';

describe('Kiracı izolasyonu — çapraz çalışma alanı yazma denemeleri (§57)', () => {
  let ctx: SeedContext;
  let brandId = '';
  let contentId = '';
  let mediaId = '';
  let ownAccountId = '';

  before(async () => {
    ctx = await getSeedContext();
    brandId = ctx.brandId;

    const media = await prisma.mediaAsset.findFirstOrThrow({ where: { workspaceId: ctx.workspaceId } });
    mediaId = media.id;
    assert.ok(media.focalPoint, 'seed medyasında odak noktası olmalı');

    const account = await prisma.socialAccount.findFirstOrThrow({ where: { workspaceId: ctx.workspaceId } });
    ownAccountId = account.id;

    const content = await createContent({
      workspaceId: ctx.workspaceId,
      brandId,
      userId: ctx.userId,
      title: 'TEST-ISOLATION',
      masterCaption: 'Demo Beauty %20 indirim 20 Eylül 2026.',
      selections: [
        { platform: 'X', contentType: 'POST' },
        { platform: 'LINKEDIN', contentType: 'POST' }
      ]
    });
    contentId = content.id;
  });

  after(async () => {
    await prisma.content.deleteMany({ where: { workspaceId: ctx.workspaceId, title: { startsWith: 'TEST-ISOLATION' } } });
  });

  it('yabancı çalışma alanı uyarlama çalıştıramaz ve hedeflere YAZILMAZ', async () => {
    const before = await prisma.platformContent.findMany({ where: { contentId }, orderBy: { key: 'asc' } });
    assert.ok(before.length >= 2);

    await assert.rejects(
      () => adaptContentToPlatforms({ contentId, workspaceId: FOREIGN_WS, userId: ctx.userId }),
      /bulunamadı/i
    );

    const after = await prisma.platformContent.findMany({ where: { contentId }, orderBy: { key: 'asc' } });
    assert.deepEqual(
      after.map((p) => [p.key, p.caption, p.captionSource]),
      before.map((p) => [p.key, p.caption, p.captionSource]),
      'yabancı çalışma alanı uyarlaması caption değiştirmemeli'
    );

    // Sürüm geçmişine de yazılmamalı (§28 denetim izi)
    const versions = await prisma.contentVersion.findMany({ where: { contentId, content: { workspaceId: ctx.workspaceId } } });
    assert.equal(versions.filter((v) => v.kind === 'AI_ADAPTED').length, 0);
  });

  it('kendi çalışma alanı uyarlaması hedefleri doldurur (yabancı blok meşru akışı bozmaz)', async () => {
    const result = await adaptContentToPlatforms({ contentId, workspaceId: ctx.workspaceId, userId: ctx.userId });
    assert.equal(result.results.length, 2);
    for (const r of result.results) {
      assert.ok(r.caption.length > 0, `${r.platform} metni boş olmamalı`);
      assert.ok(r.caption.includes('%20') && r.caption.includes('20 Eylül 2026'), 'bilgi korunmalı');
      assert.equal(r.truncated, false);
    }
  });

  it('yabancı çalışma alanı seçim eşitleyemez (içerik sahipliği zorunlu)', async () => {
    const before = await prisma.platformContent.count({ where: { contentId } });
    await assert.rejects(
      () => syncSelections(contentId, FOREIGN_WS, [{ platform: 'INSTAGRAM', contentType: 'STORY' }]),
      /bulunamadı/i
    );
    assert.equal(await prisma.platformContent.count({ where: { contentId } }), before, 'yabancı seçim hedef eklememeli');
  });

  it('platform/içerik türü normalize edilir, geçersiz seçim kaydedilmez', async () => {
    // "x" küçük harfle gelse de tek hedef olur (yinelenen hedef açılmaz).
    await syncSelections(contentId, ctx.workspaceId, [
      { platform: 'x' as any, contentType: 'post' as any },
      { platform: 'LINKEDIN', contentType: 'POST' }
    ]);
    const xRows = await prisma.platformContent.findMany({ where: { contentId, key: 'X:POST' } });
    assert.equal(xRows.length, 1, 'küçük harfli giriş yeni hedef açmamalı');

    await assert.rejects(
      () => syncSelections(contentId, ctx.workspaceId, [{ platform: 'MYSPACE' as any, contentType: 'POST' }]),
      /Geçersiz platform seçimi/
    );
    assert.equal(await prisma.platformContent.count({ where: { platform: 'MYSPACE' } }), 0);
  });

  it('yabancı sosyal hesap kimliği içeriğe bağlanmaz', async () => {
    const other = await prisma.socialAccount.findFirst({ where: { workspaceId: { not: ctx.workspaceId } } });
    const foreignId = other?.id ?? 'yabanci-hesap-kimligi';

    assert.equal(await ownedAccountId(ctx.workspaceId, foreignId), null);
    assert.equal(await ownedAccountId(ctx.workspaceId, ownAccountId), ownAccountId);

    await syncSelections(contentId, ctx.workspaceId, [
      { platform: 'X', contentType: 'POST', accountId: foreignId },
      { platform: 'LINKEDIN', contentType: 'POST', accountId: ownAccountId }
    ]);

    const x = await prisma.platformContent.findFirstOrThrow({ where: { contentId, key: 'X:POST' } });
    const li = await prisma.platformContent.findFirstOrThrow({ where: { contentId, key: 'LINKEDIN:POST' } });
    assert.equal(x.socialAccountId, null, 'yabancı hesap bağlanmamalı');
    assert.equal(li.socialAccountId, ownAccountId, 'kendi hesabı bağlanmalı');
  });

  it('yabancı çalışma alanı medya odak noktasını değiştiremez', async () => {
    const before = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
    await assert.rejects(
      () => updateFocalPoint(mediaId, FOREIGN_WS, { x: 0.11, y: 0.22 }),
      /bulunamadı/i
    );
    const after = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
    assert.equal(after.focalPoint, before.focalPoint, 'yabancı odak noktası yazma denemesi etkisiz olmalı');
    assert.equal(after.storageKey, before.storageKey, 'orijinal dosya yolu değişmemeli (§42)');
    assert.equal(after.contentHash, before.contentHash, 'orijinal hash değişmemeli (§42)');
  });

  it('kendi çalışma alanı odak noktasını güncelleyebilir', async () => {
    const before = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
    const updated = await updateFocalPoint(mediaId, ctx.workspaceId, { x: 0.5, y: 0.42 });
    const parsed = JSON.parse(updated.focalPoint ?? '{}');
    assert.equal(parsed.x, 0.5);
    assert.equal(parsed.y, 0.42);
    assert.equal(parsed.method, 'MANUAL');
    // orijinal değişmez: yalnızca odak noktası meta verisi güncellenir
    assert.equal(updated.storageKey, before.storageKey);
    assert.equal(updated.contentHash, before.contentHash);
    await prisma.mediaAsset.updateMany({ where: { id: mediaId, workspaceId: ctx.workspaceId }, data: { focalPoint: before.focalPoint } });
  });
});
