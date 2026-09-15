/**
 * Canlıya hazır arayüz testi (Faz 7 §11, §112, §117)
 * ---------------------------------------------------------------------------
 * - Müşteri arayüzünde (app sayfaları + paylaşılan bileşenler) "Demo Modu",
 *   "Demo hesabı" gibi geliştirme ibareleri BULUNMAZ.
 * - AI Geçmişi görünümü sahte geçmiş listesi (mockHistory) taşıMAZ.
 * - Ölü/sahte kontrol kalmaz: semantik arama sahte sonuç bloğu yok.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const UI_ROOTS = [
  path.join(process.cwd(), 'src', 'app', 'app'),
  path.join(process.cwd(), 'src', 'components'),
  path.join(process.cwd(), 'src', 'app', 'giris')
];

describe('Canlıya hazır arayüz — demo ibaresi yok', () => {
  it('müşteri arayüzünde "Demo Modu" / "Demo hesabı" ibaresi bulunmaz', () => {
    const offenders: string[] = [];
    for (const root of UI_ROOTS) {
      for (const file of walk(root)) {
        const text = fs.readFileSync(file, 'utf8');
        if (text.includes('Demo Modu') || text.includes('Demo hesabı') || text.includes('Demo bilgilerini')) {
          offenders.push(path.relative(process.cwd(), file));
        }
      }
    }
    assert.deepEqual(offenders, [], `Bu dosyalarda demo ibaresi kalmalı değil: ${offenders.join(', ')}`);
  });

  it('AI Geçmişi sahte geçmiş listesi içermez', () => {
    const view = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'app', 'ai-gecmisi', 'AiHistoryView.tsx'), 'utf8');
    assert.ok(!view.includes('mockHistory'), 'mockHistory kalmamalı');
    assert.ok(!view.includes('Demo Kullanıcı'), 'sahte kullanıcı kalmamalı');
    const page = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'app', 'ai-gecmisi', 'page.tsx'), 'utf8');
    assert.ok(page.includes('aiGeneration.findMany'), 'AI Geçmişi GERÇEK AiGeneration kayıtlarını okumalı');
  });

  it('medya görünümünde sahte semantik sonuç bloğu yoktur', () => {
    const view = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'app', 'medya', 'MediaView.tsx'), 'utf8');
    assert.ok(!view.includes('demoHits'), 'demoHits sahte sonuçları kalmamalı');
    assert.ok(!view.includes('Kadın elinde serum tutuyor'), 'sahte örnek medya kalmamalı');
  });
});
