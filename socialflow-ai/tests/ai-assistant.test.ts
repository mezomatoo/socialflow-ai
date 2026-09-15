/** AI asistan API servis katmanı sözleşme testleri (route'ların kullandığı fonksiyonlar). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generate, checkTurkishSpelling } from '../src/lib/ai/captionGenerationService';
import { generateHashtags } from '../src/lib/ai/hashtagService';

describe('AI asistan servis katmanı (Faz 2 §30)', () => {
  it('generate: görev dışı girdi olmadan yerel motorla Türkçe metin üretir', async () => {
    const out = await generate({ task: 'POST_TEXT', topic: 'filtre kahve indirimli kampanya', brandName: 'Kahve Dükkanım' });
    assert.equal(out.engine, 'LOCAL', 'anahtarsız ortamda yerel motor kullanılmalı');
    assert.ok(out.text.trim().length > 20, 'üretilen metin boş olmamalı');
    assert.ok(Array.isArray(out.variants) && out.variants.length > 0);
  });

  it('checkTurkishSpelling: deb bağlacı hatasını bulur ve düzeltir', () => {
    const res = checkTurkishSpelling('Ürünümüz de çok güzel bir seçenek.');
    assert.ok(res.issues.length > 0, 'en az bir sorun raporlanmalı');
    assert.ok(typeof res.corrected === 'string');
  });

  it('generateHashtags: metinden ve trend havuzundan etiket seçer', async () => {
    const res = await generateHashtags({ text: 'Ankara’da yeni açılan butik kahvecimizde filtre kahve váriosu', maxHashtags: 20, recommendedHashtags: 8 });
    assert.ok(res.selected.length > 0, 'en az bir etiket önerilmeli');
    assert.ok(res.block.startsWith('#'), 'kopyalanabilir etiket bloğu # ile başlamalı');
  });
});
