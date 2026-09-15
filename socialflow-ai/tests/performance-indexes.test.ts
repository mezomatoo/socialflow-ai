import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditCriticalQueryIndexes } from '../src/lib/database/indexAudit';
import prisma from '../src/lib/prisma';

if (!process.env.DATABASE_URL?.endsWith('test.db')) {
  throw new Error('Yalnızca ayrı test.db üzerinde çalıştırın.');
}

describe('④ Performans: Dashboard/Takvim Sorgularına Eksik İndeks Denetimi (§119-§120)', () => {
  it('tüm kritik dashboard, takvim ve planlama sorguları tanımlı indeksleri kullanır (allQueriesUseIndex: true)', async () => {
    const report = await auditCriticalQueryIndexes();

    assert.equal(report.allQueriesUseIndex, true);
    assert.ok(report.queries.length >= 5);

    // Her sorgunun bir indeks kullandığını ve SCAN TABLE içermediğini doğrula
    for (const q of report.queries) {
      assert.equal(q.usesIndex, true, `Sorgu indeks kullanmıyor: ${q.queryName}`);
      const detailsText = q.details.join(' ');
      assert.ok(!detailsText.includes('SCAN TABLE'), `Sorguda tam tablo taraması tespit edildi: ${q.queryName}`);
    }

    // Doğrulanan indekslerin listesini kontrol et
    assert.ok(report.verifiedIndexes.includes('PlatformContent_enabled_scheduledFor_idx'));
    assert.ok(report.verifiedIndexes.includes('Content_workspaceId_updatedAt_idx'));
    assert.ok(report.verifiedIndexes.includes('Content_workspaceId_brandId_idx'));
    assert.ok(report.verifiedIndexes.includes('ContentPlanItem_workspaceId_date_idx'));
    assert.ok(report.verifiedIndexes.includes('Job_workspaceId_status_idx'));
  });

  it('Takvim sorgusu: enabled + scheduledFor bileşik indeksiyle aranır', async () => {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `EXPLAIN QUERY PLAN SELECT id, contentId, platform, scheduledFor FROM PlatformContent WHERE enabled = 1 AND scheduledFor >= 1725148800000 AND scheduledFor <= 1727740800000 ORDER BY scheduledFor ASC;`
    );
    const detail = rows.map((r) => r.detail).join(' ');

    assert.ok(detail.includes('USING INDEX PlatformContent_enabled_scheduledFor_idx'));
    assert.ok(!detail.includes('SCAN TABLE PlatformContent'));
  });

  it('Dashboard son içerikler: workspaceId + updatedAt indeksi sayesinde ek bellek içi sıralama (B-TREE) gerektirmez', async () => {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `EXPLAIN QUERY PLAN SELECT id, title, status, updatedAt FROM Content WHERE workspaceId = 'test-ws' ORDER BY updatedAt DESC LIMIT 6;`
    );
    const detail = rows.map((r) => r.detail).join(' ');

    assert.ok(detail.includes('USING INDEX Content_workspaceId_updatedAt_idx'));
    assert.ok(!detail.includes('USE TEMP B-TREE FOR ORDER BY'));
  });
});
