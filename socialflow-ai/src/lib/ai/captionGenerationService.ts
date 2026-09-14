import { charLength, splitSentences, toTurkishLower, toTurkishUpper } from '../text';
import { compressTurkish } from './semanticRewriter';
import { AI_SAFETY_RULES, completeJson } from './llmClient';
import { buildBrandVoicePrompt, type BrandVoiceInput } from './brandVoice';
import { STORY_TEXT_IDEAS } from './captionAdaptationService';
import type { ContentStyle } from '../platforms/platforms';

/**
 * CaptionGenerationService — "AI İçerik Asistanı"
 * ---------------------------------------------------------------------------
 * Tüm üretken metin özellikleri burada toplanır. LLM erişimi varsa LLM,
 * yoksa doğal Türkçe üreten yerel şablon motoru kullanılır (Demo Modu).
 * Yerel motor hiçbir zaman fiyat/tarih/URL UYDURMAZ; eksik bilgiyi
 * "[BİLGİ EKSİK: ...]" olarak işaretler.
 */

export type AssistantTask =
  | 'POST_TEXT'
  | 'CAMPAIGN_TEXT'
  | 'PRODUCT_PROMO'
  | 'STORY_TEXT'
  | 'REEL_CAPTION'
  | 'HASHTAGS'
  | 'CTA'
  | 'SHORTEN'
  | 'EXTEND'
  | 'PROFESSIONALIZE'
  | 'SPELLCHECK';

export const TASK_LABELS: Record<AssistantTask, string> = {
  POST_TEXT: 'Gönderi Metni Oluştur',
  CAMPAIGN_TEXT: 'Kampanya Metni Oluştur',
  PRODUCT_PROMO: 'Ürün Tanıtımı Oluştur',
  STORY_TEXT: 'Hikaye Metni Oluştur',
  REEL_CAPTION: 'Reels Açıklaması Oluştur',
  HASHTAGS: 'Hashtag Oluştur',
  CTA: 'CTA Oluştur',
  SHORTEN: 'Metni Kısalt',
  EXTEND: 'Metni Uzat',
  PROFESSIONALIZE: 'Metni Profesyonelleştir',
  SPELLCHECK: 'Türkçe Yazım Kontrolü'
};

export interface AssistantInput {
  task: AssistantTask;
  topic?: string;
  text?: string;
  brandName?: string | null;
  brandVoice?: BrandVoiceInput | null;
  style?: ContentStyle | string;
  productName?: string;
  price?: string;
  discount?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  website?: string;
  targetLength?: number;
  tone?: string;
  platform?: string;
  contentType?: string;
}

export interface AssistantOutput {
  text: string;
  variants: string[];
  engine: 'LLM' | 'LOCAL';
  warnings: string[];
  missingFields: string[];
}

export async function generate(input: AssistantInput): Promise<AssistantOutput> {
  const llm = await tryLlm(input);
  if (llm) return llm;
  return localGenerate(input);
}

// ---------------------------------------------------------------------------
// Yerel (deterministik) üretici — doğal Türkçe şablonlar
// ---------------------------------------------------------------------------

function placeholders(input: AssistantInput): { missing: string[] } {
  const missing: string[] = [];
  if (!input.topic && !input.text && !input.productName) missing.push('konu');
  return { missing };
}

function localGenerate(input: AssistantInput): AssistantOutput {
  const brand = input.brandName?.trim() || 'markamız';
  const topic = input.topic?.trim() || input.productName?.trim() || 'yeni içeriğimiz';
  const location = input.location?.trim();
  const website = input.website?.trim();
  const warnings: string[] = [];
  const missingFields: string[] = [];
  const { missing } = placeholders(input);
  if (missing.length) missingFields.push(...missing);

  const price = input.price?.trim();
  const discount = input.discount?.trim();
  const start = input.startDate?.trim();
  const end = input.endDate?.trim();
  if (!price && input.task === 'CAMPAIGN_TEXT') warnings.push('Fiyat bilgisi verilmediği için fiyat yazılmadı. Uydurma bilgi eklenmez.');
  if (!start && !end && input.task === 'CAMPAIGN_TEXT') warnings.push('Kampanya tarihleri verilmedi; tarih bilgisi eklenmedi.');

  const variants: string[] = [];
  let text = '';

  switch (input.task) {
    case 'POST_TEXT': {
      text = [
        `${toTurkishUpper(topic.charAt(0)) + topic.slice(1)} hakkında uzun zamandır çalışıyorduk; sonunda paylaşma zamanı geldi.`,
        `${brand} olarak odağımız tek: size gerçekten işe yarayan bir deneyim sunmak. ${toTurkishUpper(topic.charAt(0))}${topic.slice(1)} tam da bu yüzden hazırlandı.`,
        website ? `Detaylar: ${website}` : 'Detayları yakında paylaşacağız.'
      ].join('\n\n');
      variants.push(
        `${topic} yayında. ${brand} ekibi olarak her ayrıntıyı yeniden düşündük.\n\n${website ? `İncelemek için: ${website}` : 'Görüşlerinizi yorumlarda bekliyoruz.'}`
      );
      variants.push(
        `Bir süredir ${toTurkishLower(topic)} üzerinde çalışıyorduk.\nBugün paylaşabildiğimiz için heyecanlıyız.\n\n${brand} · ${new Date().getFullYear()}`
      );
      break;
    }
    case 'CAMPAIGN_TEXT': {
      const lines = [`Kampanya başladı: ${topic}.`];
      if (discount) lines.push(`${discount} indirim fırsatı sizi bekliyor.`);
      if (price) lines.push(`Fiyat: ${price}.`);
      if (start && end) lines.push(`Geçerlilik: ${start} – ${end}.`);
      else if (end) lines.push(`Son gün: ${end}.`);
      if (location) lines.push(`Konum: ${location}.`);
      lines.push(website ? `Detaylar ve katılım: ${website}` : 'Detaylar için bize ulaşın.');
      text = lines.join('\n');
      variants.push(
        [
          `${topic} kampanyamız ${start ? `${start} itibarıyla ` : ''}başladı${end ? `, ${end} tarihine kadar` : ''}.`,
          [discount && `${discount} indirim`, price && `${price} fiyat`, location && `${location} mağazamızda`]
            .filter(Boolean)
            .join(' · '),
          website ? `Hemen inceleyin: ${website}` : 'Stoklar sınırlıdır.'
        ]
          .filter(Boolean)
          .join('\n\n')
      );
      break;
    }
    case 'PRODUCT_PROMO': {
      const facts: string[] = [];
      if (discount) facts.push(`${discount} indirim`);
      if (price) facts.push(price);
      if (start && end) facts.push(`${start} – ${end} arasında geçerli`);
      else if (end) facts.push(`${end} tarihine kadar geçerli`);
      else if (start) facts.push(`${start} itibarıyla`);
      if (location) facts.push(`${location}'da`);

      text = [
        `${topic} artık ${brand}'de.`,
        'Üzerinde uzun süre çalıştık; günlük kullanımda gerçekten fark yaratan ayrıntılara odaklandık.',
        facts.length ? facts.map((f) => `${f.charAt(0).toLocaleUpperCase('tr-TR')}${f.slice(1)}`).join('. ') + '.' : '',
        price ? `Fiyat: ${price}.` : '',
        website ? `İncelemek için: ${website}` : 'Sorularınızı yanıtlamaktan mutluluk duyarız.'
      ]
        .filter(Boolean)
        .join('\n\n');
      variants.push(
        [
          `${topic} ile tanışın.`,
          'Sade, işlevsel ve uzun ömürlü.',
          facts.length ? facts.join(' · ') : '',
          website ?? ''
        ]
          .filter(Boolean)
          .join('\n\n')
      );
      break;
    }
    case 'STORY_TEXT': {
      text = STORY_TEXT_IDEAS[0];
      variants.push(...STORY_TEXT_IDEAS.slice(1, 7));
      break;
    }
    case 'REEL_CAPTION': {
      text = [
        `${topic} — 15 saniyede özetledik.`,
        website ? 'Devamı profildeki bağlantıda.' : 'Devamı için takipte kalın.'
      ].join('\n');
      variants.push(`Bu ${toTurkishLower(topic)} videosunu sonuna kadar izleyin 👀\n\n${brand}`);
      break;
    }
    case 'HASHTAGS': {
      text = '';
      warnings.push('Hashtag önerileri HashtagService üzerinden üretilir. "Hashtag Oluştur" düğmesini kullanın.');
      break;
    }
    case 'CTA': {
      text = website ? `Hemen inceleyin: ${website}` : 'Hemen inceleyin.';
      variants.push(
        'Şimdi keşfet',
        'Detaylar için tıklayın',
        'Profildeki bağlantıya göz atın',
        'Bugüne özel fırsatı kaçırmayın',
        'Sepete ekleyin, fırsatı yakalayın'
      );
      break;
    }
    case 'SHORTEN': {
      const limit = input.targetLength ?? 200;
      const r = compressTurkish(input.text ?? '', limit, { protectedTerms: input.brandName ? [input.brandName] : [] });
      text = r.text;
      warnings.push(...r.warnings);
      if (r.shortened) warnings.push(`Metin ${r.originalLength} → ${r.finalLength} karaktere anlamsal olarak kısaltıldı.`);
      break;
    }
    case 'EXTEND': {
      const base = (input.text ?? '').trim();
      const sentences = splitSentences(base);
      const extended = [
        base,
        '',
        `${brand} olarak bu konuda en çok önemsediğimiz şey, size gerçekten değer katan bir deneyim sunmak.`,
        sentences.length
          ? 'Ayrıntıları ve güncel gelişmeleri kanallarımızdan paylaşmaya devam edeceğiz.'
          : 'Ayrıntıları ve güncel gelişmeleri kanallarımızdan paylaşmaya devam edeceğiz.',
        website ? `\nDaha fazlası için: ${website}` : ''
      ]
        .join('\n')
        .trim();
      text = extended;
      warnings.push('Metin genel ifadelerle genişletildi; ürün/fiyat/tarih bilgisi uydurulmadı.');
      break;
    }
    case 'PROFESSIONALIZE': {
      const base = (input.text ?? '').trim();
      text = base
        .replace(/\bselam\b/gi, 'Merhaba')
        .replace(/\bharika\b/gi, 'etkileyici')
        .replace(/\bsüper\b/gi, 'oldukça iyi')
        .replace(/\bçok iyi\b/gi, 'başarılı')
        .replace(/\b!!!+\s*/g, '. ')
        .replace(/\?\?+\s*/g, '? ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (text && text.length) text = text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1);
      variants.push(`${text}\n\n${brand} olarak sürecin her adımında aynı özeni gösteriyoruz.`);
      break;
    }
    case 'SPELLCHECK': {
      const checked = checkTurkishSpelling(input.text ?? '');
      text = checked.corrected;
      warnings.push(...checked.issues.map((i) => i.message));
      break;
    }
  }

  return { text, variants: variants.filter(Boolean).slice(0, 4), engine: 'LOCAL', warnings: dedupe(warnings), missingFields };
}

function dedupe(a: string[]) {
  return Array.from(new Set(a.filter(Boolean)));
}

// ---------------------------------------------------------------------------
// Türkçe yazım kontrolü
// ---------------------------------------------------------------------------

export interface SpellIssue {
  code: string;
  message: string;
  from?: string;
  to?: string;
  index: number;
}

const SPELL_RULES: { re: RegExp; fix?: (m: string) => string; code: string; message: string }[] = [
  {
    re: /\b(de|da)\b(?=\s+(?:bir|çok|daha|en|hem|var|yok|güzel|önemli|mevcut|bulunuyor|geçerli|geçerlidir))/gi,
    code: 'DE_BAGLAC',
    message: 'Bağlaç olan "de/da" ayrı yazılır; burada doğru görünüyor.'
  },
  {
    re: /([a-zçğıöşü])(de|da)(?=\s|$|[.,!?])/gi,
    fix: (m) => `${m.charAt(0)} ${m.slice(1)}`,
    code: 'DE_BITISIK',
    message: '"de/da" bağlacı ayrı yazılmalıdır (ör. "bizde" → "biz de"). Kelime hâl eki ise bitişik kalır; kontrol edin.'
  },
  {
    re: /\b(mi|mı|mu|mü)(?=[a-zçğıöşü])/gi,
    fix: (m) => `${m} `,
    code: 'MI_BITISIK',
    message: 'Soru eki "mi/mı/mu/mü" kendinden sonraki ekten ayrılır: "musun" değil "musun" → "mısın".'
  },
  {
    re: /\b(\w+)\s+\1\b/gi,
    code: 'DUPLICATE_WORD',
    message: 'Aynı sözcük arka arkaya tekrar ediyor.'
  },
  {
    re: /\s+([.,!?;:])/g,
    fix: (_m) => _m.trim(),
    code: 'SPACE_BEFORE_PUNCT',
    message: 'Noktalama işaretlerinden önce boşluk bırakılmaz.'
  },
  {
    re: /([.,!?;:])(?=[A-Za-zÇĞİÖŞÜa-zçğıöşü])/g,
    fix: (m) => `${m} `,
    code: 'SPACE_AFTER_PUNCT',
    message: 'Noktalama işaretlerinden sonra boşluk gerekir.'
  },
  {
    re: /\.{2}(?!\.)/g,
    fix: () => '...',
    code: 'ELLIPSIS',
    message: 'Üç nokta "..." şeklinde yazılır.'
  },
  {
    re: /\bherşey\b/gi,
    fix: () => 'her şey',
    code: 'HERSEY',
    message: '"her şey" ayrı yazılır.'
  },
  {
    re: /\bbirşey\b/gi,
    fix: () => 'bir şey',
    code: 'BIRSEY',
    message: '"bir şey" ayrı yazılır.'
  },
  {
    re: /\bhiçbirşey\b/gi,
    fix: () => 'hiçbir şey',
    code: 'HICBIRSEY',
    message: '"hiçbir şey" ayrı yazılır.'
  },
  {
    re: /\bbir çok\b/gi,
    fix: () => 'birçok',
    code: 'BIRCOK',
    message: '"birçok" bitişik yazılır.'
  },
  {
    re: /\bher hangi\b/gi,
    fix: () => 'herhangi',
    code: 'HERHANGI',
    message: '"herhangi" bitişik yazılır.'
  },
  {
    re: /\byalnış\b/gi,
    fix: () => 'yanlış',
    code: 'YANLIS',
    message: '"yanlış" sözcüğünün doğru yazımı.'
  },
  {
    re: /\bşöför\b/gi,
    fix: () => 'şoför',
    code: 'SOFOR',
    message: '"şoför" sözcüğünün doğru yazımı.'
  },
  {
    re: /\borjinal\b/gi,
    fix: () => 'orijinal',
    code: 'ORIJINAL',
    message: '"orijinal" sözcüğünün doğru yazımı.'
  },
  {
    re: /\btabiki\b/gi,
    fix: () => 'tabii ki',
    code: 'TABIIKI',
    message: '"tabii ki" ayrı yazılır.'
  },
  {
    re: /\bki(?=\s|$)/gi,
    code: 'KI_AYRI',
    message: 'Bağlaç olan "ki" ayrı, ek olan "-ki" bitişik yazılır. Kullanımı kontrol edin.'
  }
];

export function checkTurkishSpelling(text: string): { corrected: string; issues: SpellIssue[] } {
  const issues: SpellIssue[] = [];
  let out = text ?? '';

  for (const rule of SPELL_RULES) {
    out = out.replace(rule.re, (match, ...rest) => {
      const offset = typeof rest[rest.length - 2] === 'number' ? (rest[rest.length - 2] as number) : 0;
      if (rule.fix) {
        const fixed = rule.fix(match);
        if (fixed !== match) {
          issues.push({
            code: rule.code,
            message: rule.message,
            from: match,
            to: fixed,
            index: offset
          });
          return fixed;
        }
        return match;
      }
      issues.push({ code: rule.code, message: rule.message, from: match, index: offset });
      return match;
    });
  }

  // Cümle başı büyük harf
  out = out.replace(/(^|[.!?…]\s+)([a-zçğıöşü])/g, (_m, p1: string, p2: string) => p1 + p2.toLocaleUpperCase('tr-TR'));

  // Boşluk temizliği
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return { corrected: out, issues };
}

// ---------------------------------------------------------------------------
// LLM yolu
// ---------------------------------------------------------------------------

async function tryLlm(input: AssistantInput): Promise<AssistantOutput | null> {
  const schema = {
    type: 'object',
    required: ['text'],
    properties: {
      text: { type: 'string' },
      variants: { type: 'array', items: { type: 'string' } },
      warnings: { type: 'array', items: { type: 'string' } },
      missingInformation: { type: 'array', items: { type: 'string' } }
    }
  };

  const system = [
    'Sen deneyimli bir Türkçe sosyal medya metin yazarısın. Doğal, akıcı ve reklam klişelerinden uzak Türkçe yazarsın.',
    AI_SAFETY_RULES,
    buildBrandVoicePrompt(input.brandVoice, (input.style ?? 'PROFESSIONAL') as any)
  ].join('\n\n');

  const user = JSON.stringify(
    {
      gorev: TASK_LABELS[input.task],
      task: input.task,
      konu: input.topic ?? null,
      mevcutMetin: input.text ?? null,
      marka: input.brandName ?? null,
      urun: input.productName ?? null,
      fiyat: input.price ?? null,
      indirim: input.discount ?? null,
      baslangicTarihi: input.startDate ?? null,
      bitisTarihi: input.endDate ?? null,
      lokasyon: input.location ?? null,
      webSitesi: input.website ?? null,
      hedefUzunluk: input.targetLength ?? null,
      platform: input.platform ?? null,
      dil: 'tr'
    },
    null,
    2
  );

  const { data, result } = await completeJson<{ text: string; variants?: string[]; warnings?: string[]; missingInformation?: string[] }>({
    task: `assistant.${input.task}`,
    system,
    user,
    schema,
    temperature: 0.8,
    maxTokens: 1000
  });

  if (result.degraded || !data?.text) return null;

  return {
    text: String(data.text).trim(),
    variants: (data.variants ?? []).map(String).filter(Boolean).slice(0, 4),
    engine: 'LLM',
    warnings: [...(data.warnings ?? []), ...(data.missingInformation ?? []).map((m) => `Bilgi eksik, uydurulmadı: ${m}`)],
    missingFields: []
  };
}

/** Ana açıklama için hızlı iyileştirme düğmeleri (composer'da kullanılır). */
export const QUICK_ACTIONS: { id: string; label: string; task: AssistantTask; style?: ContentStyle }[] = [
  { id: 'improve', label: 'AI ile İyileştir', task: 'PROFESSIONALIZE' },
  { id: 'professional', label: 'Daha Profesyonel Yap', task: 'PROFESSIONALIZE', style: 'PROFESSIONAL' },
  { id: 'friendly', label: 'Daha Samimi Yap', task: 'PROFESSIONALIZE', style: 'FRIENDLY' },
  { id: 'shorter', label: 'Daha Kısa Yap', task: 'SHORTEN' },
  { id: 'impactful', label: 'Daha Etkileyici Yap', task: 'POST_TEXT', style: 'LAUNCH' },
  { id: 'sales', label: 'Satış Odaklı Yap', task: 'PROFESSIONALIZE', style: 'SALES' },
  { id: 'corporate', label: 'Kurumsal Yap', task: 'PROFESSIONALIZE', style: 'CORPORATE' },
  { id: 'cta', label: 'CTA Ekle', task: 'CTA' },
  { id: 'emoji', label: 'Emoji Ekle', task: 'POST_TEXT' },
  { id: 'hashtags', label: 'Hashtag Oluştur', task: 'HASHTAGS' }
];

export function charStats(text: string) {
  return { characters: charLength(text) };
}
