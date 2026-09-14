/**
 * #80 — Kısmi başarısızlık testi.
 * Bir hedef başarısız olduğunda tüm kampanya "başarısız" işaretlenmez:
 * içerik PARTIALLY_PUBLISHED olur ve YALNIZCA başarısız hedef yeniden denenir.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getSeedContext, ctxOf, accountFor, squareMediaId, targetsOf, cleanupContent, prisma, type SeedContext } from './helpers';
import { createContent, adaptContentToPlatforms } from '../src/lib/services/contentService';
import { publishContent, publishPlatformContent } from '../src/lib/social/publishingService';

const MASTER =
  'Hafta sonuna özel filtre kahvede %15 indirim. 20 Eylül 2026 tarihine kadar geçerlidir. 250 TL üzeri kargo bedava. #kahve';

const SELECTIONS: Array<{ platform: any; contentType: any }> = [
  { platform: 'INSTAGRAM', contentType: 'FEED' },
  { platform: 'X', contentType: 'POST' },
  { platform: 'LINKEDIN', contentType: 'POST' }
];

describe('Kısmi başarısızlık: PARTIALLY_PUBLISHED + yalnızca başarısız hedefi yeniden dene', () => {
  let ctx: SeedContext;
  let contentId: string;
  let mediaId: string;
  let xTargetId: string;

  before(async () => {
    ctx = await getSeedContext();
    mediaId = await squareMediaId(ctx.workspaceId);
  });

  after(async () => {
    if (contentId) await cleanupContent(contentId);
    await prisma.$disconnect();
  });

  it('3 hedef oluşturur ve uyarlar', async () => {
    const selections = [];
    for (const s of SELECTIONS) {
      const accountId = await accountFor(ctx.workspaceId, ctx.brandId, s.platform);
      selections.push({ ...s, accountId });
    }
    const content = await createContent({
      workspaceId: ctx.workspaceId,
      brandId: ctx.brandId,
      userId: ctx.userId,
      title: 'Test — kısmi başarısızlık',
      masterCaption: MASTER,
      mediaIds: [mediaId],
      selections
    });
    contentId = content.id;
    for (const s of SELECTIONS) {
      await prisma.platformContent.updateMany({
        where: { contentId, platform: s.platform, contentType: s.contentType },
        data: { mediaAssetId: mediaId }
      });
    }
    await adaptContentToPlatforms({ contentId, workspaceId: ctx.workspaceId, userId: ctx.userId });

    const targets = await targetsOf(contentId);
    assert.equal(targets.length, 3);
    xTargetId = targets.find((t) => t.platform === 'X')!.id;
  });

  it('X hedefini sınır aşımıyla başarısızlığa zorlar → PARTIALLY_PUBLISHED', async () => {
    // X açıklamasını 280 sınırının üzerine çıkar (yayın öncesi kontrol başarısız olur).
    const tooLong = 'a'.repeat(300);
    await prisma.platformContent.update({ where: { id: xTargetId }, data: { caption: tooLong, charUsed: 300 } });

    const out = await publishContent(contentId, ctxOf(ctx));
    assert.equal(out.total, 3);
    assert.equal(out.ready, 2, 'yalnızca 2 hedef başarılı olmalı');
    assert.equal(out.contentStatus, 'PARTIALLY_PUBLISHED', 'içerik kısmen yayınlandı olmalı');

    const x = await prisma.platformContent.findUnique({ where: { id: xTargetId } });
    assert.equal(x?.status, 'FAILED');
    assert.ok(x?.lastError && x.lastError.length > 0, 'başarısız hedefte Türkçe hata mesajı olmalı');

    const others = await prisma.platformContent.findMany({ where: { contentId, platform: { in: ['INSTAGRAM', 'LINKEDIN'] } } });
    for (const o of others) assert.equal(o.status, 'PUBLISHED', `${o.platform} yayınlanmış olmalı`);

    // Başarısız hedef için de bir Publication kaydı vardır (FAILED), çift değil.
    const pubs = await prisma.publication.findMany({ where: { contentId } });
    assert.equal(pubs.length, 3);
    assert.equal(pubs.filter((p) => p.status === 'PUBLISHED').length, 2);
    assert.equal(pubs.filter((p) => p.status === 'FAILED').length, 1);
  });

  it('yalnızca başarısız hedefi yeniden dener → içerik PUBLISHED, diğerleri tekrar yayınlanmaz', async () => {
    const igBefore = await prisma.publication.count({ where: { contentId, platformContent: { platform: 'INSTAGRAM' } } });
    const liBefore = await prisma.publication.count({ where: { contentId, platformContent: { platform: 'LINKEDIN' } } });
    const igAttemptsBefore = await prisma.publicationAttempt.count({ where: { publication: { contentId, platformContent: { platform: 'INSTAGRAM' } } } });

    // X metnini sınıra çek ve yalnızca onu yeniden dene.
    await prisma.platformContent.update({ where: { id: xTargetId }, data: { caption: 'Filtre kahvede %15 indirim — 20 Eylül 2026 son gün. 250 TL üzeri kargo bedava. #kahve', charUsed: 80 } });

    const retry = await publishPlatformContent(xTargetId, ctxOf(ctx));
    assert.equal(retry.ok, true, `X yeniden denemesi başarılı olmalı: ${retry.message}`);
    assert.equal(retry.status, 'PUBLISHED');

    const content = await prisma.content.findUnique({ where: { id: contentId } });
    assert.equal(content?.status, 'PUBLISHED', 'tüm hedefler yayınlanınca içerik PUBLISHED olmalı');

    // İdempotency: diğer hedefler yeniden yayınlanmadı.
    const igAfter = await prisma.publication.count({ where: { contentId, platformContent: { platform: 'INSTAGRAM' } } });
    const liAfter = await prisma.publication.count({ where: { contentId, platformContent: { platform: 'LINKEDIN' } } });
    const igAttemptsAfter = await prisma.publicationAttempt.count({ where: { publication: { contentId, platformContent: { platform: 'INSTAGRAM' } } } });
    assert.equal(igAfter, igBefore, 'Instagram için yeni Publication oluşmamalı');
    assert.equal(liAfter, liBefore, 'LinkedIn için yeni Publication oluşmamalı');
    assert.equal(igAttemptsAfter, igAttemptsBefore, 'Instagram tekrar denenmemeli');

    // Toplam Publication hâlâ 3 (X'in kaydı FAILED→PUBLISHED olarak güncellendi).
    const total = await prisma.publication.count({ where: { contentId } });
    assert.equal(total, 3);
    const xPub = await prisma.publication.findFirst({ where: { platformContentId: xTargetId } });
    assert.equal(xPub?.status, 'PUBLISHED');
  });
});
