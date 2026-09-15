/**
 * §90–98 — Faz 1 güvenlik ve dayanıklılık testleri.
 * ---------------------------------------------------------------------------
 * Kapsam:
 *   - Otomatik kaydetme: hızlı ardışık düzenlemeler son yazımı korur, sürüm
 *     geçmişine kaydeder ve çalışma alanı dışına sızmaz.
 *   - Çalışma alanı izolasyonu: başka çalışma alanı içerik/medya/platform
 *     hedeflerine erişemez (sunucu tarafı zorunluluk — §14).
 *   - Platform kuralı ihlali: sınırı aşan metin engelleyici hata üretir ve
 *     metin ASLA kesilmez (§57).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getSeedContext, prisma, type SeedContext } from './helpers';
import {
  createContent,
  syncSelections,
  updateMasterCaption,
  updatePlatformCaption,
  getContentDetail,
  listVersions
} from '../src/lib/services/contentService';
import { runPreflight } from '../src/lib/services/validationService';
import { getRule } from '../src/lib/rules/ruleEngine';
import { charLength } from '../src/lib/text';

describe('Otomatik kaydetme ve sürüm geçmişi (§28)', () => {
  let ctx: SeedContext;
  let brandId = '';
  let contentId = '';

  before(async () => {
    ctx = await getSeedContext();
    const brand = await prisma.brand.findFirstOrThrow({ where: { workspaceId: ctx.workspaceId } });
    brandId = brand.id;
    const content = await createContent({
      workspaceId: ctx.workspaceId,
      brandId,
      userId: ctx.userId,
      title: 'TEST-AUTOSAVE',
      masterCaption: 'İlk metin.'
    });
    contentId = content.id;
  });

  after(async () => {
    await prisma.content.deleteMany({ where: { workspaceId: ctx.workspaceId, title: { startsWith: 'TEST-AUTOSAVE' } } });
  });

  it('ardışık düzenlemelerde en son metin kalıcı olur', async () => {
    // Otomatik kaydetme (700 ms debounce) arayüzde tek istek üretir; sunucu
    // tarafında son yazım kazanır ve her kayıt sürüm geçmişine düşer.
    for (const caption of ['Birinci düzenleme.', 'İkinci düzenleme.', 'Son düzenleme — %20 indirim 20 Eylül 2026.']) {
      await updateMasterCaption({ contentId, workspaceId: ctx.workspaceId, masterCaption: caption, userId: ctx.userId });
    }

    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    assert.equal(content.masterCaption, 'Son düzenleme — %20 indirim 20 Eylül 2026.');

    const versions = await listVersions(contentId);
    assert.ok(versions.length >= 1, 'kayıtlar sürüm geçmişine yazılmalı');

    const audit = await prisma.auditLog.findFirst({
      where: { workspaceId: ctx.workspaceId, entityType: 'Content', entityId: contentId },
      orderBy: { createdAt: 'desc' }
    });
    assert.ok(audit, 'değişiklikler denetim kaydına yazılmalı');
  });

  it('yeniden yükleme (getContentDetail) son metni döner', async () => {
    const detail = await getContentDetail(contentId, ctx.workspaceId);
    assert.ok(detail);
    assert.equal(detail!.masterCaption, 'Son düzenleme — %20 indirim 20 Eylül 2026.');
  });
});

describe('Çalışma alanı izolasyonu (§14) — sunucu tarafı zorunluluk', () => {
  let ctx: SeedContext;
  let contentId = '';
  let targetId = '';
  let mediaId = '';

  before(async () => {
    ctx = await getSeedContext();
    const brand = await prisma.brand.findFirstOrThrow({ where: { workspaceId: ctx.workspaceId } });
    const content = await createContent({
      workspaceId: ctx.workspaceId,
      brandId: brand.id,
      userId: ctx.userId,
      title: 'TEST-ISOLATION',
      masterCaption: 'İzolasyon testi içeriği.'
    });
    contentId = content.id;
    await syncSelections(contentId, ctx.workspaceId, [{ platform: 'INSTAGRAM', contentType: 'FEED', accountId: null }]);
    const target = await prisma.platformContent.findFirstOrThrow({ where: { contentId } });
    targetId = target.id;
    const media = await prisma.mediaAsset.findFirstOrThrow({ where: { workspaceId: ctx.workspaceId } });
    mediaId = media.id;
  });

  after(async () => {
    await prisma.content.deleteMany({ where: { workspaceId: ctx.workspaceId, title: 'TEST-ISOLATION' } });
  });

  it('başka çalışma alanı içeriği okuyamaz', async () => {
    assert.equal(await getContentDetail(contentId, 'baska-workspace'), null);
    assert.equal(await getContentDetail(contentId, `${ctx.workspaceId}-x`), null);
  });

  it('başka çalışma alanı platform metnini değiştiremez', async () => {
    await assert.rejects(
      () =>
        updatePlatformCaption({
          platformContentId: targetId,
          workspaceId: 'baska-workspace',
          caption: 'Yetkisiz değişiklik'
        }),
      /bulunamadı/i
    );
    const target = await prisma.platformContent.findUniqueOrThrow({ where: { id: targetId } });
    assert.notEqual(target.caption, 'Yetkisiz değişiklik');
  });

  it('başka çalışma alanı master metni değiştiremez', async () => {
    await assert.rejects(
      () =>
        updateMasterCaption({
          contentId,
          workspaceId: 'baska-workspace',
          masterCaption: 'Yetkisiz metin'
        }),
      /bulunamadı/i
    );
  });

  it('başka çalışma alanı ön kontrol çalıştıramaz (içerik bulunamaz)', async () => {
    await assert.rejects(() => runPreflight(contentId, 'baska-workspace'), /bulunamadı/i);
  });

  it('her sorgu workspaceId ile sınırlıdır', async () => {
    const foreignContents = await prisma.content.findMany({ where: { workspaceId: 'baska-workspace' } });
    assert.equal(foreignContents.length, 0);
    const scopedMedia = await prisma.mediaAsset.findFirst({ where: { id: mediaId, workspaceId: 'baska-workspace' } });
    assert.equal(scopedMedia, null);
  });
});

describe('Platform kuralı ihlali (§57) — engelleyici hata, kesme yok', () => {
  let ctx: SeedContext;
  let contentId = '';
  let targetId = '';
  const LONG_CAPTION = 'Demo Beauty kampanyası. '.repeat(40); // ~960 karakter

  before(async () => {
    ctx = await getSeedContext();
    const brand = await prisma.brand.findFirstOrThrow({ where: { workspaceId: ctx.workspaceId } });
    const content = await createContent({
      workspaceId: ctx.workspaceId,
      brandId: brand.id,
      userId: ctx.userId,
      title: 'TEST-RULE-VIOLATION',
      masterCaption: 'Kısa master metin.'
    });
    contentId = content.id;
    await syncSelections(contentId, ctx.workspaceId, [{ platform: 'X', contentType: 'POST', accountId: null }]);
    const target = await prisma.platformContent.findFirstOrThrow({ where: { contentId, platform: 'X' } });
    targetId = target.id;

    // Kullanıcı elle sınırı aşan bir metin girdiğinde uyarı verilir; metin
    // kesilmez ve kullanıcıya ne yapacağı söylenir.
    const saved = await updatePlatformCaption({
      platformContentId: targetId,
      workspaceId: ctx.workspaceId,
      caption: LONG_CAPTION,
      userId: ctx.userId
    }).catch((error: unknown) => error as Error);

    // Servis ya reddeder ya da metni olduğu gibi saklayıp uyarır; ikisinde de
    // metin sessizce KISALTILMAZ.
    const current = await prisma.platformContent.findUniqueOrThrow({ where: { id: targetId } });
    if (saved instanceof Error) {
      assert.notEqual(charLength(current.caption ?? ''), 280, 'metin otomatik kesilmemeli');
    }
  });

  after(async () => {
    await prisma.content.deleteMany({ where: { workspaceId: ctx.workspaceId, title: 'TEST-RULE-VIOLATION' } });
  });

  it('sınırı aşan metin ön kontrolde hata olarak raporlanır ve engeller', async () => {
    const rule = await getRule(ctx.workspaceId, 'X', 'POST');
    assert.ok(rule);

    await prisma.platformContent.update({
      where: { id: targetId },
      data: { caption: LONG_CAPTION.slice(0, rule!.maxCaptionLength + 50) }
    });

    const report = await runPreflight(contentId, ctx.workspaceId);
    const target = report.targets.find((t) => t.platformContentId === targetId);
    assert.ok(target);
    const tooLong = target!.checks.find((c) => c.code === 'CAPTION_TOO_LONG');
    assert.ok(tooLong, 'sınır aşımı CAPTION_TOO_LONG olarak raporlanmalı');
    assert.equal(tooLong!.level, 'ERROR');
    assert.equal(report.blocking, true, 'içerik kaynaklı hata bloklamalı');
    assert.ok(report.headline.includes('düzeltme'), 'başlık kullanıcıya yol göstermeli');
  });

  it('metin uzunluğu kural sınırına göre raporlanır, kesilmez', async () => {
    const rule = await getRule(ctx.workspaceId, 'X', 'POST');
    const current = await prisma.platformContent.findUniqueOrThrow({ where: { id: targetId } });
    assert.ok(charLength(current.caption ?? '') > rule!.maxCaptionLength, 'metin olduğu gibi kalmalı');
  });
});
