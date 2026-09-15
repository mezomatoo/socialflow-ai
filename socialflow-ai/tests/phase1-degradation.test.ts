/**
 * §69 — Yapay zekâ sağlayıcısı çöktüğünde çalışma DURMAZ.
 * ---------------------------------------------------------------------------
 * Harici sağlayıcı yapılandırılmış ama erişilemezse (ağ hatası, 5xx, zaman
 * aşımı) içerik üretimi yerel motora düşer, bilgiler (fiyat/tarih) korunur ve
 * kullanıcıya dürüst bir uyarı döner. Elle düzenleme ve kaydetme engellenmez.
 *
 * Sağlayıcı ayarları ilk import ile yüklenir (ai-offline-env) — modüller içe
 * aktarılmadan önce ortam hazır olur.
 */
import './ai-offline-env';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type * as Helpers from './helpers';

// Modüller, ortam değişkenleri hazır olduktan SONRA dinamik olarak yüklenir.
let helpers: typeof Helpers;
let provider: typeof import('../src/lib/ai/provider');
let llmClient: typeof import('../src/lib/ai/llmClient');
let contentService: typeof import('../src/lib/services/contentService');

before(async () => {
  helpers = await import('./helpers');
  provider = await import('../src/lib/ai/provider');
  llmClient = await import('../src/lib/ai/llmClient');
  contentService = await import('../src/lib/services/contentService');
});

const MASTER =
  'Demo Beauty bakım setinde 20 Eylül 2026 tarihine kadar %20 indirim! ' +
  'Cilt bakım rutinine nemlendirici ve serum dahil. Sınırlı stok.';

describe('§69 — AI sağlayıcı arızasında zarif bozulma', () => {
  let ctx: Helpers.SeedContext;
  let contentId = '';

  before(async () => {
    ctx = await helpers.getSeedContext();
    const brand = await helpers.prisma.brand.findFirstOrThrow({ where: { workspaceId: ctx.workspaceId } });
    const content = await contentService.createContent({
      workspaceId: ctx.workspaceId,
      brandId: brand.id,
      userId: ctx.userId,
      title: 'TEST-AI-DEGRADATION',
      masterCaption: MASTER
    });
    contentId = content.id;
    await contentService.syncSelections(contentId, ctx.workspaceId, [
      { platform: 'INSTAGRAM', contentType: 'FEED', accountId: null },
      { platform: 'LINKEDIN', contentType: 'POST', accountId: null }
    ]);
  });

  after(async () => {
    if (contentId) await helpers.prisma.content.deleteMany({ where: { id: contentId } });
  });

  it('harici sağlayıcı yapılandırılmış olarak görünür ve çağrı hata ile sonuçlanır', async () => {
    assert.equal(provider.activeProviderName(), 'openai');
    assert.equal(provider.isExternalAiAvailable(), true);

    const { data, result } = await llmClient.completeJson<{ caption: string }>({
      task: 'caption.adapt',
      system: 'test',
      user: 'test',
      schema: { type: 'object' }
    });
    assert.equal(data, null, 'sağlayıcı hatasında veri dönmemeli');
    assert.equal(result.degraded, true, 'yerel motora düşülmeli');
  });

  it('uyarlama yine tamamlanır, bilgiler korunur ve kullanıcı uyarılır', async () => {
    const result = await contentService.adaptContentToPlatforms({
      contentId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId
    });

    assert.equal(result.results.length, 2);
    for (const r of result.results) {
      assert.equal(r.ok, true, `${r.platform} hedefi üretilebilmeli`);
      assert.ok(r.caption.includes('%20'), 'indirim oranı korunmalı');
      assert.ok(r.caption.includes('20 Eylül 2026'), 'tarih korunmalı');
      assert.equal(r.truncated, false);
    }

    // Kullanıcıya dürüst uyarı: AI erişilemedi, yerel motor kullanıldı.
    assert.ok(result.aiNotice, 'AI arızası kullanıcıya bildirilmeli');
    assert.ok(result.aiNotice!.includes('ulaşılamıyor'));

    // Üretim kaydı başarısızlığı raporlar (§39).
    const logs = await helpers.prisma.aiGeneration.findMany({ where: { workspaceId: ctx.workspaceId, contentId } });
    assert.equal(logs.length, 2);
    assert.ok(logs.every((l: { status: string }) => l.status === 'FAILED'), 'sağlayıcı hatası FAILED olarak kaydedilmeli');
    assert.ok(logs.every((l: { errorCode: string | null }) => l.errorCode === 'AI_UNAVAILABLE'));
  });

  it('AI çökmüşken elle düzenleme ve kaydetme çalışmaya devam eder', async () => {
    const target = await helpers.prisma.platformContent.findFirstOrThrow({ where: { contentId, platform: 'LINKEDIN' } });
    await contentService.updatePlatformCaption({
      platformContentId: target.id,
      workspaceId: ctx.workspaceId,
      caption: 'AI kapalıyken elle yazıldı: %20 indirim, 20 Eylül 2026.',
      userId: ctx.userId
    });
    const updated = await helpers.prisma.platformContent.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(updated.captionSource, 'MANUAL');
    assert.ok(updated.caption.includes('%20'));

    // Master metin güncellemesi (otomatik kaydetme yolu) de çalışır.
    await contentService.updateMasterCaption({
      contentId,
      workspaceId: ctx.workspaceId,
      masterCaption: MASTER,
      title: 'TEST-AI-DEGRADATION güncel',
      userId: ctx.userId
    });
    const content = await helpers.prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    assert.equal(content.title, 'TEST-AI-DEGRADATION güncel');
  });
});
