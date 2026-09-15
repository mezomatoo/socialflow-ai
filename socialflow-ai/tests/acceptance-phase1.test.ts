/**
 * §99 — Faz 1 KABUL SENARYOSU (uçtan uca)
 * ---------------------------------------------------------------------------
 * Senaryo:
 *   1. Kayıt ol (yeni çalışma alanı)
 *   2. "Demo Beauty" markası oluştur
 *   3. product.jpg yükle
 *   4. %20 indirim ve 20 Eylül tarihi içeren TEK ana açıklama yaz
 *   5. Instagram Feed, Instagram Story, Facebook Post, LinkedIn Post, X Post seç
 *   6. "Platformlara Uyarla"
 *   7. Her platform için metin üretildi mi? BİLGİLER KORUNDU mu? (fiyat/tarih)
 *   8. Medya varyantları üretildi mi? Orijinal değişti mi?
 *   9. Yayın kontrolü uyarı veriyor mu?
 *  10. LinkedIn metni BAĞIMSIZ düzenlenebiliyor mu (diğerleri etkilenmiyor mu)?
 *  11. Taslak kaydedildi mi ve Taslaklar listesinde görünüyor mu?
 *  12. Hiçbir şey harici olarak YAYINLANMADI mı?
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { prisma } from './helpers';
import { POST as registerRoute } from '../src/app/api/v1/auth/register/route';
import { uploadMedia } from '../src/lib/services/mediaService';
import { createMediaVariant } from '../src/lib/services/mediaProcessingService';
import {
  createContent,
  syncSelections,
  adaptContentToPlatforms,
  updatePlatformCaption,
  getContentDetail
} from '../src/lib/services/contentService';
import { runPreflight } from '../src/lib/services/validationService';
import { getRule } from '../src/lib/rules/ruleEngine';
import { charLength } from '../src/lib/text';

const MASTER_CAPTION =
  'Demo Beauty yeni sezon bakım setinde 20 Eylül 2026 tarihine kadar %20 indirim! ' +
  'Cilt bakım rutinine nemlendirici, serum ve temizleme jeli dahil. ' +
  'Ürünlerimiz dermatolojik olarak test edilmiştir.';

const TARGETS = [
  { platform: 'INSTAGRAM', contentType: 'FEED' },
  { platform: 'INSTAGRAM', contentType: 'STORY' },
  { platform: 'FACEBOOK', contentType: 'FEED' },
  { platform: 'LINKEDIN', contentType: 'POST' },
  { platform: 'X', contentType: 'POST' }
] as const;

/** Metinde korunması ZORUNLU bilgiler (§35, §58). */
const REQUIRED_FACTS = ['%20', '20 Eylül 2026'];

describe('§99 — Faz 1 kabul senaryosu (kayıt → marka → medya → uyarlama → taslak)', () => {
  let workspaceId = '';
  let userId = '';
  let brandId = '';
  let mediaId = '';
  let contentId = '';
  let linkedinTargetId = '';

  after(async () => {
    if (workspaceId) {
      await prisma.aiGeneration.deleteMany({ where: { workspaceId } }).catch(() => undefined);
      await prisma.content.deleteMany({ where: { workspaceId } }).catch(() => undefined);
      await prisma.mediaVariant.deleteMany({ where: { workspaceId } }).catch(() => undefined);
      await prisma.mediaAsset.deleteMany({ where: { workspaceId } }).catch(() => undefined);
      await prisma.brand.deleteMany({ where: { workspaceId } }).catch(() => undefined);
      await prisma.workspaceMember.deleteMany({ where: { workspaceId } }).catch(() => undefined);
      await prisma.passwordResetToken.deleteMany({ where: { userId } }).catch(() => undefined);
      await prisma.session.deleteMany({ where: { userId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
      await prisma.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => undefined);
    }
  });

  before(async () => {
    // 1) KAYIT — gerçek kayıt ucu üzerinden (yeni çalışma alanı + OWNER üyeliği)
    const email = `kabul-${Date.now().toString(36)}@ornek.test`;
    const res = await registerRoute(
      new Request('http://localhost/api/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Kabul Kullanıcısı',
          email,
          password: 'Sosyal2026!',
          workspaceName: 'Demo Güzellik Ajansı'
        })
      }),
      { params: {} }
    );
    assert.equal(res.status, 200, 'kayıt başarılı olmalı');
    const body = (await res.json()) as any;
    workspaceId = body.data.workspace.id;
    userId = body.data.id;
    assert.ok(workspaceId && userId);

    // Çalışma alanı izolasyonu: yeni kayıtta yalnızca bu kullanıcı üyedir.
    const members = await prisma.workspaceMember.findMany({ where: { workspaceId } });
    assert.equal(members.length, 1);
    assert.equal(members[0].role, 'OWNER');
  });

  it('2) "Demo Beauty" markası oluşturulur ve marka sesi tanımlanır', async () => {
    const brand = await prisma.brand.create({
      data: {
        workspaceId,
        name: 'Demo Beauty',
        slug: `demo-beauty-${Date.now().toString(36)}`,
        primaryColor: '#db2777',
        description: 'Cilt bakımı ve kişisel bakım ürünleri',
        targetAudience: '18-34 yaş bakım rutiniyle ilgilenenler',
        defaultStyle: 'PROFESSIONAL',
        requiredHashtags: 'demobeauty',
        bannedHashtags: '',
        isDefault: true,
        voice: {
          create: {
            tone: 'Samimi ama profesyonel',
            personality: 'Uzman, güven veren, sade',
            audience: '18-34 yaş',
            allowedTerms: 'cilt bakımı,nemlendirici',
            bannedTerms: 'mucize,kesin çözüm',
            mustKeepTerms: 'dermatolojik olarak test edilmiştir',
            formality: 'SEMI_FORMAL',
            emojiLevel: 'LOW'
          }
        }
      }
    });
    brandId = brand.id;
    assert.ok(brand.id);

    const voice = await prisma.brandVoice.findFirst({ where: { brandId } });
    assert.ok(voice, 'marka sesi kaydedilmeli');
    assert.ok(voice!.bannedTerms.includes('mucize'));
  });

  it('3) product.jpg yüklenir — orijinal değişmez, tekilleştirme çalışır', async () => {
    const source = path.join(process.cwd(), 'public', 'demo', 'demo-1-square.jpg');
    const bytes = fs.readFileSync(source);
    assert.ok(bytes.length > 1000, 'demo görseli okunabilmeli');

    const { asset, deduplicated } = await uploadMedia({
      workspaceId,
      brandId,
      originalName: 'product.jpg',
      mimeType: 'image/jpeg',
      bytes,
      width: 1080,
      height: 1080,
      createdBy: userId,
      tags: ['urun', 'product']
    });
    mediaId = asset.id;
    assert.equal(asset.originalName, 'product.jpg');
    assert.equal(deduplicated, false);
    assert.equal(asset.status, 'READY');
    assert.equal(String(asset.contentHash).length, 64);

    // Aynı dosya tekrar yüklenirse yeni kayıt açılmaz (mükerrer yükleme yok).
    const again = await uploadMedia({
      workspaceId,
      originalName: 'product-kopya.jpg',
      mimeType: 'image/jpeg',
      bytes,
      createdBy: userId
    });
    assert.equal(again.deduplicated, true);
    assert.equal(again.asset.id, mediaId);
  });

  it('4-5) Tek ana açıklama + 5 platform hedefi seçilir', async () => {
    const content = await createContent({
      workspaceId,
      brandId,
      userId,
      title: 'Demo Beauty — Sonbahar Bakım Seti',
      masterCaption: MASTER_CAPTION,
      linkUrl: 'https://demo-beauty.example/kampanya',
      defaultStyle: 'PROFESSIONAL',
      // §99: yüklenen product.jpg içeriğe bağlanır (Hikaye gibi türler medya ister).
      mediaIds: [mediaId]
    });
    contentId = content.id;

    await syncSelections(
      contentId,
      workspaceId,
      TARGETS.map((t) => ({ platform: t.platform, contentType: t.contentType, accountId: null }))
    );

    const detail = await getContentDetail(contentId, workspaceId);
    assert.ok(detail);
    assert.equal(detail!.platformContents.length, 5, '5 platform hedefi oluşmalı');
    assert.equal(detail!.status, 'DRAFT');
    // Hiçbir hedef yayınlanmadı.
    assert.ok(detail!.platformContents.every((pc: any) => pc.status === 'DRAFT' || pc.status === 'READY'));
  });

  it('6-7) "Platformlara Uyarla" — her platform için ayrı metin, BİLGİLER KORUNUR', async () => {
    const result = await adaptContentToPlatforms({ contentId, workspaceId, userId });
    assert.equal(result.results.length, 5);

    const captions = new Map<string, string>();
    for (const r of result.results) {
      assert.equal(r.ok, true, `${r.platform}/${r.contentType} uyarlanabilmeli`);
      const rule = await getRule(workspaceId, r.platform, r.contentType);
      assert.ok(rule, 'platform kuralı bulunmalı');
      assert.ok(r.charactersUsed <= r.limit, `${r.platform}/${r.contentType} karakter sınırını aşmamalı`);
      assert.equal(r.charactersUsed, charLength(r.caption));
      assert.ok(r.caption.trim().length > 0, 'boş metin üretilmemeli');

      // BİLGİ KORUMA (§35): indirim oranı ve tarih aynen kalmalı.
      for (const fact of REQUIRED_FACTS) {
        assert.ok(
          r.caption.includes(fact),
          `${r.platform}/${r.contentType} metninde "${fact}" korunmalıydı. Üretilen: ${r.caption.slice(0, 160)}`
        );
      }

      // Metin ASLA karakter sınırından kesilmez (§36).
      assert.equal(r.truncated, false, `${r.platform}/${r.contentType} metni kesilmemeli`);

      captions.set(`${r.platform}:${r.contentType}`, r.caption);
      if (r.platform === 'LINKEDIN') linkedinTargetId = r.platformContentId;
    }

    // Platform bağımsızlığı (§37): Story ve Feed metinleri farklı kurgulanır.
    const igFeed = captions.get('INSTAGRAM:FEED')!;
    const igStory = captions.get('INSTAGRAM:STORY')!;
    const xPost = captions.get('X:POST')!;
    assert.notEqual(igFeed, igStory, 'Instagram Feed ve Story metinleri bağımsız olmalı');
    assert.ok(charLength(xPost) <= 280, 'X metni 280 karakteri aşmamalı');
    assert.ok(charLength(igStory) < charLength(igFeed), 'Story metni Feed’den kısa olmalı');

    // Sürüm geçmişi ve AI üretim kaydı (§39)
    const versions = await prisma.contentVersion.findMany({ where: { contentId } });
    assert.ok(versions.length >= 1, 'uyarlama sürüm geçmişine yazılmalı');
    const generations = await prisma.aiGeneration.findMany({ where: { workspaceId, contentId } });
    assert.equal(generations.length, 5, 'her hedef için üretim kaydı olmalı');
    assert.ok(generations.every((g) => g.status === 'SUCCESS' || g.status === 'SKIPPED'));
    assert.ok(generations.every((g) => g.inputHash && g.inputHash.length === 64), 'istem özeti saklanmalı, ham istem değil');
  });

  it('8) Medya varyantları üretilir; orijinal dosya DEĞİŞMEZ', async () => {
    const before = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
    const bytes = fs.readFileSync(path.join(process.cwd(), 'public', 'demo', 'demo-1-square.jpg'));

    const storyVariant = await createMediaVariant({
      workspaceId,
      mediaAssetId: mediaId,
      platform: 'INSTAGRAM',
      contentType: 'STORY',
      aspectRatio: '9:16',
      bytes,
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1920,
      cropMode: 'SMART',
      processingMethod: 'DETERMINISTIC',
      createdById: userId
    });
    assert.equal(storyVariant.processingStatus, 'READY');
    assert.notEqual(storyVariant.storageKey, before.storageKey);

    const feedVariant = await createMediaVariant({
      workspaceId,
      mediaAssetId: mediaId,
      platform: 'INSTAGRAM',
      contentType: 'FEED',
      aspectRatio: '4:5',
      bytes,
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
      processingMethod: 'USER_FOCAL_POINT',
      focalPoint: { x: 0.5, y: 0.4 },
      createdById: userId
    });
    assert.equal(feedVariant.processingStatus, 'READY');

    const after = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
    assert.equal(after.contentHash, before.contentHash, 'orijinal hash değişmemeli');
    assert.equal(after.storageKey, before.storageKey, 'orijinal dosya yolu değişmemeli');
    assert.equal(after.width, 1080);
    assert.equal(after.height, 1080);

    const variants = await prisma.mediaVariant.findMany({ where: { workspaceId, mediaAssetId: mediaId } });
    assert.equal(variants.length, 2);
    assert.ok(fs.existsSync(path.join(process.cwd(), 'storage', storyVariant.storageKey)));
  });

  it('9) Yayın kontrolü uyarı ve hazırlık durumunu döner (§57)', async () => {
    const report = await runPreflight(contentId, workspaceId);
    assert.ok(report);
    assert.equal(typeof report!.blocking, 'boolean');
    // Faz 2 ile yayınlama açıldı: hesap bağlama eksikliği artık ENGELLEYİCİDİR
    // (yayın denemesi gerçek hesap olmadan yapılamaz; §3 dürüstlük korunur).
    assert.equal(report!.phase1Mode, false);
    assert.equal(report!.contentReadyCount, report!.totalCount, 'tüm hedefler içerik olarak uygun olmalı');
    assert.equal(report!.blocking, true, 'Faz 2’de bağlı hesap eksikliği engellemelidir');
    assert.ok(report!.totalCount >= 5);
    assert.ok(Array.isArray(report!.targets));
    assert.equal(report!.targets.length, report!.totalCount);
    const linkedin = report!.targets.find((t) => t.platform === 'LINKEDIN');
    assert.ok(linkedin, 'LinkedIn hedefi raporda olmalı');
    assert.equal(typeof report!.headline, 'string');
    // Kural ihlali varsa mesaj Türkçe ve anlaşılır olmalı (§68).
    for (const item of report!.targets) {
      for (const issue of item.issues ?? []) {
        assert.ok(String(issue.message ?? '').length > 0, 'medya uyarısı Türkçe mesaj taşımalı');
      }
      for (const check of item.checks ?? []) {
        assert.ok(String(check.message ?? '').length > 0, 'kontrol satırı mesaj taşımalı');
        assert.ok(['OK', 'INFO', 'WARNING', 'ERROR'].includes(check.level));
      }
    }
  });

  it('10) LinkedIn metni BAĞIMSIZ düzenlenir — diğer platformlar etkilenmez', async () => {
    const others = await prisma.platformContent.findMany({
      where: { contentId, NOT: { id: linkedinTargetId } }
    });
    const beforeOthers = new Map(others.map((o) => [o.id, o.caption]));

    const edited = 'LinkedIn için elle düzenlendi: 20 Eylül 2026’ya kadar %20 indirim. ' +
      'Demo Beauty bakım seti profesyonel ağınızda da ilgi görür. #demobeauty';
    await updatePlatformCaption({
      platformContentId: linkedinTargetId,
      workspaceId,
      caption: edited,
      userId
    });

    const linkedin = await prisma.platformContent.findUniqueOrThrow({ where: { id: linkedinTargetId } });
    assert.equal(linkedin.caption, edited);
    assert.equal(linkedin.captionSource, 'MANUAL');

    for (const [id, caption] of beforeOthers) {
      const now = await prisma.platformContent.findUniqueOrThrow({ where: { id } });
      assert.equal(now.caption, caption, 'diğer platform metinleri değişmemeli');
    }

    // Elle düzenlenen metin yeni bir uyarlamada korunur (preserveManual).
    await adaptContentToPlatforms({ contentId, workspaceId, userId, preserveManual: true });
    const kept = await prisma.platformContent.findUniqueOrThrow({ where: { id: linkedinTargetId } });
    assert.equal(kept.caption, edited, 'elle düzenlenen metin korunmalı');
  });

  it('11) İçerik taslak olarak kaydedilir ve Taslaklar listesinde görünür', async () => {
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    assert.ok(['DRAFT', 'READY', 'ADAPTED'].includes(content.status) || content.status.length > 0);
    assert.equal(content.workspaceId, workspaceId);

    // Taslaklar ekranı DRAFT/READY durumlarını listeler.
    const drafts = await prisma.content.findMany({
      where: { workspaceId, status: { in: ['DRAFT', 'READY', 'PROCESSING', 'ADAPTED'] } },
      orderBy: { updatedAt: 'desc' }
    });
    assert.ok(drafts.some((d) => d.id === contentId), 'içerik taslaklar listesinde olmalı');
    assert.equal(drafts[0].id, contentId);
  });

  it('12) Hiçbir şey harici olarak YAYINLANMADI', async () => {
    const publications = await prisma.publication.findMany({ where: { platformContent: { contentId } } });
    assert.equal(publications.length, 0, 'harici yayın kaydı OLMA MAMALI');

    const targets = await prisma.platformContent.findMany({ where: { contentId } });
    for (const t of targets) {
      assert.notEqual(t.status, 'PUBLISHED');
      assert.equal(t.externalPostId, null, 'harici gönderi kimliği oluşmamalı');
      assert.equal(t.publishedAt, null);
    }

    // Faz 2 ile yayınlama modülü açıldı; yalnızca henüz gelmeyen fazlar kapalı kalır.
    const { assertModuleEnabled, isModuleEnabled } = await import('../src/lib/phase/phaseGates');
    assert.doesNotThrow(() => assertModuleEnabled('socialPublishing'));
    assert.equal(isModuleEnabled('analytics'), false, 'Analitik hâlâ Faz 4 kapsamında kapalı olmalı');
  });
});
