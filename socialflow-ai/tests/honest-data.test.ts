/**
 * Dürüst veri testleri (Faz 7 §13, §90)
 * ---------------------------------------------------------------------------
 * - Trendler: sağlayıcı yapılandırılmadı → BOŞ liste + dürüst uyarı; demo
 *   trend dizisi kod tabanında YOK.
 * - Rakip analizi: mock rakip/içgörü dizisi YOK; servis boş döner.
 * - Görünümler sahte "gap analizi" maddesi ve demo çalışma alanı kimliği
 *   taşımaz.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { listTrends, isTrendProviderConfigured } from '../src/lib/trends/service';
import { listCompetitors, listInsights } from '../src/lib/competitor/service';

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'src', rel), 'utf8');
}

describe('Dürüst veri — sahte trend/rakip verisi yok', () => {
  it('trend servisi sağlayıcısızken BOŞ liste + uyarı döner', async () => {
    const result = await listTrends('ws-1');
    assert.equal(result.items.length, 0, 'sağlayıcı yokken trend OLMAZ');
    assert.equal(result.providerConfigured, false);
    assert.ok(result.warning?.includes('yapılandırılmadı'));
    assert.equal(isTrendProviderConfigured(), false);
  });

  it('rakip servisi mock veri İÇERMEZ, boş döner', async () => {
    assert.equal((await listCompetitors('ws-1')).length, 0);
    assert.equal((await listInsights('ws-1')).length, 0);
    assert.equal((await listInsights('ws-1', 'c1')).length, 0);
  });

  it('demoTrends ve mockCompetitors kaynak koddan kaldırıldı', () => {
    assert.ok(!readSrc(path.join('lib', 'trends', 'service.ts')).includes('demoTrends'), 'demoTrends kalmamalı');
    assert.ok(!readSrc(path.join('lib', 'competitor', 'service.ts')).includes('mockCompetitors'), 'mockCompetitors kalmamalı');
    assert.ok(!readSrc(path.join('lib', 'competitor', 'service.ts')).includes('mockInsights'), 'mockInsights kalmamalı');
  });

  it('görünümler sahte maddeler ve demo çalışma alanı taşımaz', () => {
    const trends = readSrc(path.join('app', 'app', 'trendler', 'TrendsView.tsx'));
    const competitor = readSrc(path.join('app', 'app', 'rakip-analizi', 'CompetitorView.tsx'));
    assert.ok(!trends.includes('Soğuk demleme'), 'hardcoded sahte trend maddesi kalmamalı');
    assert.ok(!trends.includes('demo-workspace-id'), 'demo çalışma alanı kimliği kalmamalı');
    assert.ok(!competitor.includes('Eğitici Reels boşluğu'), 'hardcoded sahte içgörü kalmamalı');
    assert.ok(!competitor.includes("listCompetitors('demo')"), 'demo ws çağrısı kalmamalı');
  });
});
