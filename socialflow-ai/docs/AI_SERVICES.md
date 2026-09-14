# AI Servisleri

SocialFlow AI'in tüm metin zekâsı `src/lib/ai/` altında toplanır. İki çalışma modu vardır:

- **`deterministic` (varsayılan):** Ağ çağrısı yapmayan, yerel, tekrarlanabilir Türkçe metin motoru.
  Demo ve testler bu modda çalışır; çıktı deterministiktir.
- **`openai` / `anthropic`:** `AI_PROVIDER` ile etkinleştirilir; aynı güvenlik kuralları ve JSON sözleşmesi geçerlidir.

`AI_DEMO_MODE=true` iken LLM anahtarı olsa bile yerel motor tercih edilebilir. `activeProvider()` ve
`aiModeLabel()` etkin modu döndürür.

---

## 1. Pazarlıksız güvenlik kuralları

`src/lib/ai/llmClient.ts` → `AI_SAFETY_RULES` (hem LLM prompt'una eklenir hem yerel motor bu kurallara uyar):

1. **ASLA** fiyat, indirim yüzdesi, kampanya tarihi, ürün özelliği, yasal/tıbbi iddia veya web adresi **uydurma**.
   Yalnızca kullanıcının verdiği veya marka profilinde bulunan bilgiler kullanılır.
2. Emin olunmayan bilgi gerekirse eklenmez; bunun yerine `[BİLGİ EKSİK: ...]` olarak işaretlenir.
3. Ürün adları, fiyatlar, tarihler, kampanya koşulları, bağlantılar, zorunlu hashtag'ler ve zorunlu mention'lar **aynen korunur**.
4. Metin **asla karakter sınırından kesilmez**; anlam korunarak yeniden yazılır.
5. Çıktı her zaman doğal, akıcı Türkçe olmalı (makine çevirisi gibi durmamalı).
6. Türkçe yazım kuralları: "de/da" bağlacı ayrı, "-de/-da" hâl eki bitişik; soru eki "mi" ayrı.
7. Yalnızca istenen JSON alanları döner; açıklama eklenmez.

> `missingFields[]` çıktısı, eksik bilgi işaretlerini arayüze taşır; kullanıcı tamamlamadan yayınlama engellenebilir.

---

## 2. Anlamsal yeniden yazım (asla kesmez)

`src/lib/ai/semanticRewriter.ts` → `compressTurkish(input, limit, options)`:

Metni `limit` karakterin altına **anlamı koruyarak** indirir. Yaklaşım:

1. **Korunan terimleri çıkar** (`extractProtectedTerms`): marka adı, fiyat (`250 TL`), indirim (`%15`),
   tarih (`20 Eylül 2026`), kampanya koşulları. `%`/para birimi önünde `\b` kullanılmaz (doğru eşleşme için).
2. **Cümlelere ayır ve puanla** (`scoreSentence`): korunan terim içeren, CTA olan, baştaki/sondaki cümleler
   daha yüksek puan alır (`protectedTermWeight`).
3. **En iyi alt kümeyi seç** (`selectBestSubset`): karakter bütçesine sığan, toplam önem puanı en yüksek cümle
   kümesi — 0/1 çanta problemi. `n ≤ 16` için tam çözüm (bitmask), üzeri için puan/uzunluk yoğunluğuna göre açgözlü.
4. **Doğrula** (`verifyProtectedTerms`): çıkan metinde korunan terimlerin kaldığını denetler; eksikse uyarı üretir.

Yardımcılar: `truncateAtSentenceBoundary` (yalnızca son çare, cümle sınırında), `adjustEmojis`
(NONE/LOW/MEDIUM/HIGH), `capitalizeFirst`, `isCtaSentence`.

**Sonuç:** `CompressResult { text, shortened, truncated, modifications[], warnings[] }`.
`shortened=true` metnin anlamsal olarak yeniden yazıldığını, `truncated=true` ise (istenmeyen) kesme olduğunu belirtir.
Hedef her zaman `shortened` olup `truncated=false` kalmasıdır.

---

## 3. Platform uyarlaması

`src/lib/ai/captionAdaptationService.ts` → `adaptCaption(input): AdaptationOutput`:

Her `PlatformContent` için **bağımsız** optimize metin üretir:

1. **Korunan varlıkları topla:** `requiredTerms` + marka sesi `mustKeepTerms` + marka adı + master'dan çıkarılanlar.
   Mention'lar (`extractMentions`) ve URL'ler (`extractUrls`) ayrıca korunur.
2. **Hashtag bütçesi:** `generateHashtags` ile platformun `maxHashtags`/`recommendedHashtags` sınırına göre etiket
   bloğu; yasaklı/güvensiz etiketler elenir (`removedBlocked` → uyarı). `maxHashtags=0` ise metindeki etiketler kaldırılır.
3. **CTA bütçesi:** `buildCta` ile platforma uygun çağrı; `hashtagPlacement` (INLINE/FIRST_COMMENT/SEPARATE) bütçeyi etkiler.
4. **Gövde uyarlaması:** `textLimit = limit − hashtagBütçesi − ctaBütçesi` hesaplanır; gövde `compressTurkish` ile
   bu sınıra **anlamsal olarak** indirilir (kesilmez). LLM modunda `completeJson` ile yeniden yazım istenir.
5. **Çıktı:** `AdaptationOutput { caption, hashtags, cta, firstComment, engine: 'LLM'|'LOCAL', shortened, truncated, charactersUsed, limit, warnings[], modifications[] }`.

`adaptStoryText` + `STORY_TEXT_IDEAS` story metinlerini üretir.

---

## 4. Marka sesi & stil

`src/lib/ai/brandVoice.ts`:

- `STYLE_PROFILES` (ContentStyle → StyleProfile): PROFESSIONAL, FRIENDLY, SALES, CORPORATE, LAUNCH, eğlenceli vb.
- `buildBrandVoicePrompt(voice, style)` — LLM için marka sesi prompt'u.
- `applyStyleLocally(text, style, voice)` — deterministik modda tonu uygular.
- `resolveEmojiLevel(style, voice)` — NONE/LOW/MEDIUM/HIGH emoji yoğunluğu.

---

## 5. Asistan & hızlı aksiyonlar

`src/lib/ai/captionGenerationService.ts` → `generate(input): AssistantOutput`:

- `AssistantOutput { text, variants[], engine, warnings[], missingFields[] }`.
- `QUICK_ACTIONS`: improve, professional, friendly, shorter, impactful, sales, corporate, cta, emoji, hashtags.
- `checkTurkishSpelling(text)` → `{ corrected, issues[] }` (de/da, mi, hâl ekleri vb.).
- `charStats(text)` — karakter/kelime/okuma istatistikleri.

API: `/api/ai/generate`, `/api/ai/adapt`, `/api/ai/hashtags`, `/api/ai/spellcheck`, `/api/ai/timing`.

---

## 6. Hashtag servisi

`src/lib/ai/hashtagService.ts` → `generateHashtags(input): HashtagOptimizeResult`:

- `extractKeywords(text)` ile anahtar kelimeler; `brandTag(name)` ile marka etiketi.
- `checkTagSafety(tag)` — yasaklı/güvensiz etiketleri eler (ör. `#takipçisatın`, `#like4like` spam riski).
- `appendHashtags(caption, block, limit)` — etiketleri bütçeye göre ekler (`added` bayrağı).
- Çıktı: önerilen etiketler, `block`, `removedBlocked[]`.

---

## 7. Yayınlama zamanı önerisi

`src/lib/ai/publishingTimeService.ts` → `recommendPublishingTimes(...)`:

- Platform/içerik türü ve saat dilimine (Europe/Istanbul) göre `TimeSlot` önerileri üretir.
- `describeSlot(slot, tz)` insan okunur Türkçe açıklama.
- API: `POST /api/ai/timing` → composer'daki "Planla" modalında `aiSuggested` işaretli öneriler.

> Zamanlama önerisi **tahmindir**; gerçek analitik değildir ve sahte performans verisi üretmez.

---

## 8. LLM istemci sözleşmesi

`src/lib/ai/llmClient.ts`:

- `completeJson<T>(req)` — sağlayıcıdan **JSON** ister; `parseJsonLoose<T>` ile kod bloğu/ek metin toleranslı ayrıştırılır.
- `LlmRequest { system, user, jsonSchema?, temperature?, maxTokens? }`; `system` prompt'una `AI_SAFETY_RULES` eklenir.
- `deterministic` modda `completeJson` ağ çağrısı yapmaz; `data: null` döner ve servisler yerel motora düşer.
- Anahtarlar yalnızca sunucu tarafında okunur (`env.ai.openaiKey` / `anthropicKey`); asla istemciye gönderilmez.

---

## Test edilebilirlik

Deterministik mod, AI davranışının test edilmesini sağlar. `tests/critical-path.test.ts` şunu doğrular:
6 platform için uyarlanan metinlerin tümü sınır içinde (`charUsed ≤ charLimit`), `captionSource=AI`, ve korunan
gerçekler (`%15`, `20 Eylül 2026`) **her platformda** korunur — yani motor kesmez, anlamı ve gerçekleri korur.
