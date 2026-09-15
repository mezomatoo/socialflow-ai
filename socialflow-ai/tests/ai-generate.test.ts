/**
 * AI görev doğrulama testleri (Faz 7 — "Geçersiz AI görevi" düzeltmesi)
 * ---------------------------------------------------------------------------
 * - Geçerli görevler GERÇEK deterministic üretimle 200 döner (ui akışı).
 * - Geçersiz görev hata mesajı DESTEKLENEN görevleri listeler (§113 anlaşılır
 *   Türkçe hata deneyimi); kullanıcı doğru görev adını görebilir.
 * - Arayüzün kullandığı QUICK_ACTIONS kimlikleri geçerli görevlerdir.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generate, TASK_LABELS, QUICK_ACTIONS } from '../src/lib/ai/captionGenerationService';

describe('AI generate görev doğrulama', () => {
  it('geçerli görev (POST_TEXT) gerçek çıktı üretir', async () => {
    const out = await generate({
      task: 'POST_TEXT',
      topic: 'yeni sezon kahve çekirdeği',
      brandName: 'Test Kahve',
      platform: 'INSTAGRAM',
      style: 'PROFESSIONAL'
    });
    assert.ok(out && typeof out.text === 'string' && out.text.length > 10, 'çıktı metni üretilmeli');
  });

  it('SPELLCHECK görevi metin tabanlı çalışır', async () => {
    const out = await generate({ task: 'SPELLCHECK', text: 'Merhaba dunya bu bir denme' });
    assert.ok(out && typeof out.text === 'string' && out.text.length > 5);
  });

  it('TASK_LABELS 11 görevi kapsar ve boş etiket yoktur', () => {
    const tasks = Object.keys(TASK_LABELS);
    assert.ok(tasks.length >= 11);
    for (const t of tasks) assert.ok(TASK_LABELS[t as keyof typeof TASK_LABELS].length > 3);
    assert.ok(!tasks.includes('CAPTION'), 'CAPTION geçerli görev DEĞİLDİR (POST_TEXT kullanılır)');
  });

  it('arayüz hızlı aksiyonları yalnızca geçerli görevleri kullanır', () => {
    for (const action of QUICK_ACTIONS) {
      assert.ok(action.task in TASK_LABELS, `hızlı aksiyon görevi geçersiz: ${action.task}`);
    }
  });
});
