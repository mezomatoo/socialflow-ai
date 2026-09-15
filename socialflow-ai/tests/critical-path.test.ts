/**
 * #79 — Kritik yol entegrasyon testi.
 * Tek master Content → 6 PlatformContent çocuğu → varyant/metin → doğrulama →
 * planlama → bağımsız yayınlar. Kampanya ağ başına KOPYALANMAZ.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getSeedContext, ctxOf, accountFor, squareMediaId, targetsOf, cleanupContent, prisma, type SeedContext } from './helpers';
import { createContent, adaptContentToPlatforms } from '../src/lib/services/contentService';
import { runPreflight } from '../src/lib/services/validationService';
import { scheduleContent } from '../src/lib/services/schedulingService';
import { publishContent } from '../src/lib/social/publishingService';
import { charLength } from '../src/lib/text';

const MASTER =
  'Yeni sezon filtre kahvemiz raflarda! 20 Eylül 2026 tarihine kadar tüm demleme ekipmanlarında %15 indirim. ' +
  'Mağazamızda 250 TL üzeri alışverişlerde kargo bedava. Kadıköy Moda şubesinde sizi bekliyoruz. #kahve #nitelikkahve';

// Kare (1:1) görselle uyumlu, medya gerektirmeyen 6 hedef.
const SELECTIONS: Array<{ platform: any; contentType: any }> = [
  { platform: 'INSTAGRAM', contentType: 'FEED' },
  { platform: 'FACEBOOK', contentType: 'FEED' },
  { platform: 'X', contentType: 'POST' },
  { platform: 'LINKEDIN', contentType: 'POST' },
  { platform: 'THREADS', contentType: 'POST' },
  { platform: 'GOOGLE_BUSINESS', contentType: 'LOCAL_POST' }
];

describe('Kritik yol: 1 master içerik → 6 platform çocuğu → yayın', () => {
  let ctx: SeedContext;
  let contentId: string;
  let mediaId: string;

  before(async () => {
    ctx = await getSeedContext();
    mediaId = await squareMediaId(ctx.workspaceId);
  });

  after(async () => {
    if (contentId) await cleanupContent(contentId);
    await prisma.$disconnect();
  });

  it('6 seçimle tek bir Content + 6 PlatformContent çocuğu oluşturur (kampanya kopyalanmaz)', async () => {
    const selections = [];
    for (const s of SELECTIONS) {
      const accountId = await accountFor(ctx.workspaceId, ctx.brandId, s.platform);
      selections.push({ ...s, accountId });
    }

    const content = await createContent({
      workspaceId: ctx.workspaceId,
      brandId: ctx.brandId,
      userId: ctx.userId,
      title: 'Test — kritik yol',
      masterCaption: MASTER,
      mediaIds: [mediaId],
      selections
    });
    contentId = content.id;

    // Her hedefe kare medyayı ata (composer'ın medya atamasını taklit eder).
    for (const s of SELECTIONS) {
      await prisma.platformContent.updateMany({
        where: { contentId, platform: s.platform, contentType: s.contentType },
        data: { mediaAssetId: mediaId }
      });
    }

    const targets = await targetsOf(contentId);
    assert.equal(targets.length, 6, '6 PlatformContent çocuğu oluşmalı');

    const keys = new Set(targets.map((t) => t.key));
    assert.equal(keys.size, 6, 'Her hedefin anahtarı benzersiz olmalı (PLATFORM:CONTENT_TYPE)');

    // Tek master Content var; ağ başına ayrı kampanya YOK.
    const contents = await prisma.content.findMany({ where: { id: contentId } });
    assert.equal(contents.length, 1, 'Yalnızca tek bir master Content olmalı');
    assert.equal(contents[0].status, 'DRAFT');
    for (const t of targets) assert.equal(t.status, 'DRAFT');
  });

  it('AI uyarlaması her hedefe sınır içinde, gerçekleri koruyan metin üretir (asla kesmez)', async () => {
    const res = await adaptContentToPlatforms({ contentId, workspaceId: ctx.workspaceId, userId: ctx.userId });
    assert.ok(res, 'adapt sonucu dönmeli');

    const targets = await targetsOf(contentId);
    for (const t of targets) {
      const len = charLength(t.caption);
      assert.ok(len > 0, `${t.platform} açıklaması boş olmamalı`);
      assert.ok(len <= t.charLimit, `${t.platform} açıklaması (${len}) sınırı (${t.charLimit}) aşmamalı — kesme yok`);
      assert.equal(t.captionSource, 'AI', `${t.platform} metni AI kaynaklı olmalı`);
      // Korunan gerçekler: indirim oranı ve tarih her platformda kalmalı.
      assert.match(t.caption, /%15/, `${t.platform} metninde %15 indirimi korunmalı`);
      assert.match(t.caption, /20 Eylül 2026/, `${t.platform} metninde kampanya tarihi korunmalı`);
    }
  });

  it('ön kontrol (preflight) 6 hedefi değerlendirir ve engellemez', async () => {
    const report = await runPreflight(contentId, ctx.workspaceId, { demoMode: true });
    assert.equal(report.totalCount, 6);
    assert.equal(report.blocking, false, `preflight engellememeli: ${report.headline}`);
    assert.equal(report.readyCount, 6, '6 hedef de yayına hazır olmalı');
  });

  it('planlama hedefleri SCHEDULED yapar, Schedule + kuyruk işi oluşturur', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const out = await scheduleContent({
      contentId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      scheduledFor: future
    });
    assert.equal(out.scheduled, 6);

    const targets = await targetsOf(contentId);
    for (const t of targets) assert.equal(t.status, 'SCHEDULED');

    const schedules = await prisma.schedule.findMany({ where: { contentId } });
    assert.equal(schedules.length, 6, 'her hedef için Schedule kaydı');

    const jobs = await prisma.job.findMany({ where: { type: 'PublishContentJob', idempotencyKey: { startsWith: 'publish:' } } });
    const mine = jobs.filter((j) => {
      const p = JSON.parse(j.payload);
      return p.contentId === contentId;
    });
    assert.equal(mine.length, 6, 'her hedef için bağımsız kuyruk işi');

    const content = await prisma.content.findUnique({ where: { id: contentId } });
    assert.equal(content?.status, 'SCHEDULED');
  });

  it('yayınlama 6 bağımsız Publication üretir, içerik PUBLISHED olur', async () => {
    const out = await publishContent(contentId, ctxOf(ctx));
    assert.equal(out.total, 6);
    assert.equal(out.ready, 6, `6 hedef de yayınlanmalı: ${out.results.map((r) => `${r.platform}/${r.status}:${r.message}`).join(' | ')}`);
    assert.equal(out.contentStatus, 'PUBLISHED');

    const pubs = await prisma.publication.findMany({ where: { contentId } });
    assert.equal(pubs.length, 6, 'her hedef için bağımsız Publication');
    const idem = new Set(pubs.map((p) => p.idempotencyKey));
    assert.equal(idem.size, 6, 'idempotency anahtarları benzersiz olmalı');
    for (const p of pubs) {
      assert.equal(p.status, 'PUBLISHED');
      assert.equal(p.demoMode, true, 'demo modu işaretli olmalı');
      assert.equal(p.permalink, null, 'demo modda sahte kalıcı bağlantı üretilmez');
      assert.ok(p.providerPostId?.startsWith('demo_'), 'demo sağlayıcı kimliği');
    }

    // Demo dürüstlüğü: gerçek paylaşım yapılmadı bildirimi.
    const notes = await prisma.notification.findMany({ where: { contentId, type: 'PUBLISHED' } });
    assert.ok(notes.some((n) => n.message.includes('Simülasyon')), 'simülasyon bildirimi olmalı');
  });

  it('yeniden yayınlama idempotenttir — çift gönderim yok', async () => {
    const before = await prisma.publication.count({ where: { contentId } });
    const out = await publishContent(contentId, ctxOf(ctx));
    assert.equal(out.ready, 6, 'zaten yayınlanmış hedefler tekrar başarılı döner');
    const after = await prisma.publication.count({ where: { contentId } });
    assert.equal(after, before, 'yeni Publication oluşmamalı (idempotent)');

    const attempts = await prisma.publicationAttempt.count({
      where: { publication: { contentId } }
    });
    assert.equal(attempts, 6, 'her yayın için tek deneme kaydı kalmalı');
  });
});
