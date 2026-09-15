import {
  charLength,
  extractHashtagTokens,
  extractMentions,
  extractProtectedTerms,
  extractUrls,
  splitSentences,
  truncateWords
} from '../text';

/**
 * Anlamsal (semantic) Türkçe metin yeniden yazıcı — yerel motor.
 * ---------------------------------------------------------------------------
 * LLM erişimi olmadığında (Demo Modu) devreye girer. Temel ilke:
 * metni karakter sınırından KESMEZ; anlamı koruyarak kademeli biçimde
 * yeniden yazar. Kesme işlemi yalnızca son çaredir ve uyarı olarak işaretlenir.
 *
 * Kademeler (her biri bir öncekinden daha agresif):
 *   0  Temizlik            — hashtag/başlık ayrıştırma, boşluk normalizasyonu
 *   1  İfade kısaltma      — güvenli Türkçe eş anlamlı dönüşümler
 *   2  Cümle eleme          — önemsiz cümleleri çıkar (korunan terimler hariç)
 *   3  Yan cümle sadeleştirme — "-erek/-arak", "ki" yan cümleleri, dolgu zarfları
 *   4  Sözcük kısaltma      — uzun eklerin kısa karşılıkları
 *   5  SON ÇARE kesme       — sözcük sınırında, uyarı üretir
 */

export interface Modification {
  stage: string;
  from: string;
  to: string;
  reason: string;
}

export interface CompressResult {
  text: string;
  originalLength: number;
  finalLength: number;
  limit: number;
  shortened: boolean;
  truncated: boolean;
  stage: number;
  modifications: Modification[];
  warnings: string[];
  dropped: string[];
}

/** Uzunluk sırasına göre uygulanır; anlamı bozmayan güvenli dönüşümler. */
const PHRASE_RULES: [RegExp | string, string, string][] = [
  [/büyük bir heyecanla/gi, 'heyecanla', 'Dolgu ifade kısaltıldı'],
  [/heyecanla duyuruyoruz/gi, 'duyuruyoruz', 'Dolgu ifade kısaltıldı'],
  [/sizlerle paylaşmaktan mutluluk duyuyoruz/gi, 'paylaşıyoruz', 'Uzun ifade kısaltıldı'],
  [/paylaşmaktan mutluluk duyuyoruz/gi, 'paylaşıyoruz', 'Uzun ifade kısaltıldı'],
  [/paylaşmaktan gurur duyuyoruz/gi, 'paylaşıyoruz', 'Uzun ifade kısaltıldı'],
  [/mutluluk duyuyoruz/gi, 'mutluyuz', 'Uzun ifade kısaltıldı'],
  [/gurur duyuyoruz/gi, 'gururluyuz', 'Uzun ifade kısaltıldı'],
  [/dikkatinize sunmak isteriz ki/gi, 'Bilginize:', 'Uzun ifade kısaltıldı'],
  [/bildiğiniz gibi,?/gi, '', 'Dolgu ifade kaldırıldı'],
  [/herkesin bildiği gibi,?/gi, '', 'Dolgu ifade kaldırıldı'],
  [/öncelikle belirtmek gerekir ki/gi, '', 'Dolgu ifade kaldırıldı'],
  [/belirtmek isteriz ki/gi, '', 'Dolgu ifade kaldırıldı'],
  [/şunu söyleyebiliriz ki/gi, '', 'Dolgu ifade kaldırıldı'],
  [/siz değerli (?:müşterilerimiz|takipçilerimiz|dostlarımız)/gi, 'sizler', 'Hitap kısaltıldı'],
  [/değerli müşterilerimiz/gi, 'müşterilerimiz', 'Hitap kısaltıldı'],
  [/değerli takipçilerimiz/gi, 'takipçilerimiz', 'Hitap kısaltıldı'],
  [/birçok/gi, 'çok', 'Eş anlamlı kısaltma'],
  [/birbirinden (?:özel|güzel|şık)/gi, 'özel', 'Dolgu sıfat kaldırıldı'],
  [/en kısa (?:sürede|zamanda)/gi, 'hemen', 'İfade kısaltıldı'],
  [/kısa süre içinde/gi, 'yakında', 'İfade kısaltıldı'],
  [/vakit kaybetmeden/gi, 'hemen', 'İfade kısaltıldı'],
  [/zaman kaybetmeden/gi, 'hemen', 'İfade kısaltıldı'],
  [/hemen şimdi/gi, 'şimdi', 'Tekrar kaldırıldı'],
  [/şimdi hemen/gi, 'şimdi', 'Tekrar kaldırıldı'],
  [/şu anda/gi, 'şimdi', 'İfade kısaltıldı'],
  [/bu arada,?/gi, '', 'Dolgu ifade kaldırıldı'],
  [/ayrıca,?/gi, '', 'Bağlaç sadeleştirildi'],
  [/bununla birlikte,?/gi, 'ama', 'Bağlaç kısaltıldı'],
  [/buna rağmen,?/gi, 'yine de', 'Bağlaç kısaltıldı'],
  [/aynı zamanda/gi, 'hem de', 'Bağlaç kısaltıldı'],
  [/sonuç olarak,?/gi, 'kısacası', 'Bağlaç kısaltıldı'],
  [/özetle söylemek gerekirse,?/gi, 'özetle', 'İfade kısaltıldı'],
  [/dikkat edilmesi gereken (?:bir )?(?:nokta|husus)/gi, 'önemli nokta', 'İfade kısaltıldı'],
  [/gerçekleştirmek/gi, 'yapmak', 'Eş anlamlı kısaltma'],
  [/gerçekleştirdik/gi, 'yaptık', 'Eş anlamlı kısaltma'],
  [/gerçekleştiriyoruz/gi, 'yapıyoruz', 'Eş anlamlı kısaltma'],
  [/faydalanabilirsiniz/gi, 'yararlanın', 'Fiil kısaltıldı'],
  [/yararlanabilirsiniz/gi, 'yararlanın', 'Fiil kısaltıldı'],
  [/inceleyebilirsiniz/gi, 'inceleyin', 'Fiil kısaltıldı'],
  [/göz atabilirsiniz/gi, 'göz atın', 'Fiil kısaltıldı'],
  [/ziyaret edebilirsiniz/gi, 'ziyaret edin', 'Fiil kısaltıldı'],
  [/keşfedebilirsiniz/gi, 'keşfedin', 'Fiil kısaltıldı'],
  [/deneyimleyebilirsiniz/gi, 'deneyimleyin', 'Fiil kısaltıldı'],
  [/satın alabilirsiniz/gi, 'satın alın', 'Fiil kısaltıldı'],
  [/ulaşabilirsiniz/gi, 'ulaşın', 'Fiil kısaltıldı'],
  [/katılabilirsiniz/gi, 'katılın', 'Fiil kısaltıldı'],
  [/edinebilirsiniz/gi, 'edinebilirsiniz', ''],
  [/başvuruda bulunmak/gi, 'başvurmak', 'İfade kısaltıldı'],
  [/başvuruda bulunun/gi, 'başvurun', 'İfade kısaltıldı'],
  [/talep oluşturmak/gi, 'talep etmek', 'İfade kısaltıldı'],
  [/iletişime geçmek için/gi, 'iletişim için', 'İfade kısaltıldı'],
  [/iletişime geçebilirsiniz/gi, 'iletişime geçin', 'Fiil kısaltıldı'],
  [/satın almak için/gi, 'almak için', 'İfade kısaltıldı'],
  [/yararlanmak için/gi, 'yararlanmak için', ''],
  [/fırsatından yararlanmak için/gi, 'fırsatı için', 'İfade kısaltıldı'],
  [/kampanyamızdan yararlanmak için/gi, 'kampanya için', 'İfade kısaltıldı'],
  [/stoklarla sınırlıdır/gi, 'stoklarla sınırlı', 'İfade kısaltıldı'],
  [/sınırlı sayıdadır/gi, 'sınırlı sayıda', 'İfade kısaltıldı'],
  [/sizleri bekliyoruz/gi, 'bekliyoruz', 'İfade kısaltıldı'],
  [/sizleri de bekliyoruz/gi, 'sizi de bekliyoruz', 'İfade kısaltıldı'],
  [/sitemizi ziyaret edin/gi, 'siteyi ziyaret edin', 'İfade kısaltıldı'],
  [/web sitemizi ziyaret ederek/gi, 'sitemizden', 'İfade kısaltıldı'],
  [/profilimizdeki bağlantıya tıklayarak/gi, 'profildeki bağlantıdan', 'İfade kısaltıldı'],
  [/profildeki bağlantıya tıklayarak/gi, 'profildeki bağlantıdan', 'İfade kısaltıldı'],
  [/aşağıdaki bağlantıya tıklayarak/gi, 'bağlantıdan', 'İfade kısaltıldı'],
  [/detaylı bilgi almak için/gi, 'detaylar için', 'İfade kısaltıldı'],
  [/detaylı bilgi için/gi, 'detaylar için', 'İfade kısaltıldı'],
  [/daha fazla bilgi için/gi, 'bilgi için', 'İfade kısaltıldı'],
  [/daha fazla bilgi almak için/gi, 'bilgi için', 'İfade kısaltıldı'],
  [/şartlar ve koşullar geçerlidir/gi, 'koşullar geçerlidir', 'İfade kısaltıldı'],
  [/kampanya koşulları geçerlidir/gi, 'koşullar geçerlidir', 'İfade kısaltıldı']
];

/** Aşama 3: dolgu zarfları ve zayıf yan cümleler. */
const FILLER_WORDS: [RegExp, string][] = [
  [/\b(?:oldukça|bir hayli|epey|gayet|fazlasıyla|son derece|birçok açıdan)\s+/gi, ''],
  [/\b(?:muhteşem|harika|muazzam|olağanüstü|mükemmel)\s+(?:bir\s+)?/gi, ''],
  [/\b(?:gerçekten|hakikaten|doğrusu|aslında|tabii ki|elbette ki)\s+/gi, ''],
  [/\b(?:bildiğiniz|daha önce de belirttiğimiz) gibi,?\s*/gi, ''],
  [/\s*,\s*(?:ki\s+)/gi, ' '],
  [/\b(?:ve|ile)\s+(?:aynı zamanda|bunun yanında)\b/gi, 've'],
  [/\s{2,}/g, ' ']
];

/** Aşama 4: sözcük düzeyinde kısaltmalar (daha agresif). */
const WORD_RULES: [RegExp, string][] = [
  [/\biçerisinde\b/gi, 'içinde'],
  [/\bboyunca\b/gi, 'boyu'],
  [/\bvasıtasıyla\b/gi, 'ile'],
  [/\baracılığıyla\b/gi, 'ile'],
  [/\bnedeniyle\b/gi, 'yüzünden'],
  [/\bsebebiyle\b/gi, 'yüzünden'],
  [/\bhususunda\b/gi, 'konuda'],
  [/\bkonusunda\b/gi, 'konuda'],
  [/\bakabinde\b/gi, 'sonra'],
  [/\bmüteakip\b/gi, 'sonraki'],
  [/\bneticesinde\b/gi, 'sonunda'],
  [/\bitibarıyla\b/gi, 'itibaren'],
  [/\bkapsamında\b/gi, 'içinde'],
  [/\bdoğrultusunda\b/gi, 'yönünde'],
  [/\bgerçekleştirilen\b/gi, 'yapılan'],
  [/\bsunulmaktadır\b/gi, 'sunuluyor'],
  [/\bbulunmaktadır\b/gi, 'var'],
  [/\byapılmaktadır\b/gi, 'yapılıyor'],
  [/\balmaktadır\b/gi, 'alıyor'],
  [/\bedilmektedir\b/gi, 'ediliyor'],
  [/\bdır\b/g, 'dır'],
  [/\bsatışa sunulmuştur\b/gi, 'satışta'],
  [/\bsatışa çıkmıştır\b/gi, 'satışta'],
  [/\byayına girmiştir\b/gi, 'yayında'],
  [/\bbaşlamıştır\b/gi, 'başladı'],
  [/\bsona ermiştir\b/gi, 'bitti'],
  [/\bdevam etmektedir\b/gi, 'sürüyor']
];

const FILLER_SENTENCE_MARKERS = [
  'bildiğiniz gibi',
  'herkesin bildiği',
  'siz de bilirsiniz',
  'takdir edersiniz',
  'malumunuz',
  'diye düşünüyoruz',
  'inanıyoruz ki',
  'sizce de',
  'umarız beğenirsiniz',
  'beğenmeyi ve paylaşmayı unutmayın',
  'yorumlarda buluşalım',
  'detaylar yorumlarda'
];

const CTA_MARKERS = [
  'hemen',
  'şimdi',
  'tıkla',
  'ziyaret et',
  'keşfet',
  'incele',
  'satın al',
  'fırsatı kaçırma',
  'kaçırmayın',
  'başvur',
  'katıl',
  'profildeki bağlantı',
  'linke tıkla',
  'sepete ekle',
  'rezerve et'
];

export function isCtaSentence(sentence: string): boolean {
  const s = sentence.toLocaleLowerCase('tr-TR');
  return CTA_MARKERS.some((m) => s.includes(m));
}

/** Cümle önem puanı: korunan terimler, CTA, sayılar, konum. */
/** Bir korunan terimin ticari önemine göre ağırlık döndürür. */
export function protectedTermWeight(term: string): number {
  const t = (term ?? '').trim();
  if (!t) return 0;
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return 6.0; // bağlantı
  if (t.startsWith('@')) return 6.0; // mention
  if (t.startsWith('#')) return 3.0; // hashtag
  if (/%/.test(t)) return 7.0; // indirim yüzdesi — en kritik
  if (/(₺|TL|TRY|USD|EUR|\$|€|£)/i.test(t)) return 7.0; // fiyat
  if (/\b(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\b/i.test(t)) return 5.0; // tarih
  if (/\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(t)) return 5.0; // 12.09.2026
  if (/\d{1,2}:\d{2}/.test(t)) return 2.0; // saat — düşük öncelik
  if (/\d{3}\s?\d{3}\s?\d{2}\s?\d{2}/.test(t)) return 4.0; // telefon
  return 4.0; // ürün adı / diğer
}

/**
 * "Bilgi çıpası" (fact anchor): içinde fiyat/indirim/tarih/bağlantı/mention gibi
 * KORUNMASI ZORUNLU ticari bilgi bulunan cümleler. Kısaltma sırasında bu
 * cümleler önce rezerve edilir; aksi halde skorlama, kampanya bilgisini
 * düşürüp yerine tanıtım cümlesini koyabilir (§35).
 */
export function factAnchorIndexes(
  sentences: string[],
  protectedTerms: string[],
  options: { minWeight?: number } = {}
): number[] {
  const minWeight = options.minWeight ?? 5;
  const out: number[] = [];
  sentences.forEach((sentence, i) => {
    const lower = sentence.toLocaleLowerCase('tr-TR');
    const weight = protectedTerms.reduce(
      (acc, term) => (term && lower.includes(term.toLocaleLowerCase('tr-TR')) ? Math.max(acc, protectedTermWeight(term)) : acc),
      0
    );
    if (weight >= minWeight) out.push(i);
  });
  return out;
}

/**
 * Bilgi çıpalarını (fiyat/indirim/tarih/bağlantı taşıyan cümleler) TAMAMEN
 * kapsayacak metin bütçesi. Kısaltma hedefi bunun altına inemez; inerse
 * kampanya bilgisi kaybolur (§35).
 */
export function factSentenceBudget(sentences: string[], protectedTerms: string[]): number | null {
  const idx = factAnchorIndexes(sentences, protectedTerms);
  if (!idx.length) return null;
  return idx.reduce((acc, i, n) => acc + charLength(sentences[i]) + (n ? 1 : 0), 0);
}

/** Geriye dönük uyumluluk: en kısa bilgi çıpası cümlesinin uzunluğu. */
export function shortestFactSentenceLength(sentences: string[], protectedTerms: string[]): number | null {
  const idx = factAnchorIndexes(sentences, protectedTerms);
  if (!idx.length) return null;
  return Math.min(...idx.map((i) => charLength(sentences[i])));
}

export function scoreSentence(sentence: string, index: number, total: number, protectedTerms: string[], brandNames: string[]): number {
  const lower = sentence.toLocaleLowerCase('tr-TR');
  let score = 0;

  // Konum: ilk cümle (kanca/lead) en değerli; son cümle genelde CTA.
  if (index === 0) score += 4.5;
  else if (index === 1) score += 1.2;
  if (index === total - 1) score += 1.5;
  if (index === total - 2) score += 0.6;

  // Korunan terimler ticari kritikliğinie göre ağırlıklandırılır:
  // fiyat/indirim/URL/mention > tarih > telefon > saat > ürün adı.
  for (const term of protectedTerms) {
    if (!term) continue;
    if (!lower.includes(term.toLocaleLowerCase('tr-TR'))) continue;
    score += protectedTermWeight(term);
  }
  for (const brand of brandNames) {
    if (brand && lower.includes(brand.toLocaleLowerCase('tr-TR'))) score += 2.0;
  }

  if (isCtaSentence(sentence)) score += 3.0;
  if (/\d/.test(sentence)) score += 1.0;
  if (/[?]/.test(sentence.trim())) score += 0.4;

  // Dolgu cezaları
  for (const m of FILLER_SENTENCE_MARKERS) if (lower.includes(m)) score -= 3.0;
  const len = charLength(sentence);
  if (len < 18) score -= 0.8;
  // Uzun cümleler bütçeyi tek başına tüketmesin: kademeli ceza.
  if (len > 130) score -= (len - 130) * 0.06;
  if (len > 220) score -= 1.5;

  return score;
}

function applyPhrases(input: string, mods: Modification[], rules: [RegExp | string, string, string][] | [RegExp, string][], aggressive: boolean): string {
  let out = input;
  for (const rule of rules as [RegExp | string, string, string?][]) {
    const [pattern, replacement, reason] = rule;
    if (!reason && !aggressive) continue;
    const re = typeof pattern === 'string' ? new RegExp(escapeRegExp(pattern), 'gi') : pattern;
    if (re.test(out)) {
      const before = out;
      out = out.replace(re, replacement);
      if (out !== before && reason) {
        mods.push({ stage: 'ifade', from: firstDiff(before, out), to: reason ? replacement : '', reason });
      }
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstDiff(a: string, b: string): string {
  const as = a.split(/\s+/);
  const bs = b.split(/\s+/);
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    if (as[i] !== bs[i]) return (as.slice(Math.max(0, i - 2), i + 4).join(' ') || a).slice(0, 90);
  }
  return a.slice(0, 90);
}

export interface CompressOptions {
  /** Korunması zorunlu terimler: marka adı, ürün adı, fiyat, tarih, kampanya koşulu. */
  protectedTerms?: string[];
  brandNames?: string[];
  /** Metne eklenmesi gereken bağlantılar (ayrıca tutulur, kesilmez). */
  keepUrls?: boolean;
  /** Hashtag'ler ayrı tutulacaksa metinden çıkarılır. */
  stripHashtags?: boolean;
  maxModifications?: number;
}

/**
 * Metni `limit` karakterin altına indirecek şekilde anlamsal olarak yeniden yazar.
 */
/**
 * Verilen karakter bütçesine sığan, toplam önem puanı EN YÜKSEK cümle
 * alt kümesini seçer (0/1 çanta problemi). Cümleler belge sırasına göre
 * birleştirildiği için aralarına tek boşluk girer.
 * - n <= 22: tam çözüm ( bitmask ).
 * - n > 22: puan/uzunluk yoğunluğuna göre açgözlü yaklaşım.
 */
export function selectBestSubset(
  items: { i: number; len: number; score: number }[],
  limit: number,
  options: { mustInclude?: number[] } = {}
): number[] {
  const n = items.length;
  if (n === 0) return [];

  // Bilgi çıpaları: bütçe elverdiğince ÖNCE rezerve edilir. Böylece kampanya
  // bilgisi (fiyat/tarih) taşıyan cümle, tanıtım cümlesi uğruna düşürülmez.
  const reserved: number[] = [];
  if (options.mustInclude?.length) {
    const reservedItems = options.mustInclude
      .map((i) => items.find((it) => it.i === i))
      .filter((it): it is { i: number; len: number; score: number } => Boolean(it))
      .sort((a, b) => a.len - b.len);
    let used = 0;
    for (const it of reservedItems) {
      const add = it.len + (reserved.length ? 1 : 0);
      if (used + add <= limit) {
        reserved.push(it.i);
        used += add;
      }
    }
    items = items.filter((it) => !reserved.includes(it.i));
    limit -= used;
    if (items.length === 0) return reserved.sort((a, b) => a - b);
  }

  const finish = (picked: number[]) => [...reserved, ...picked].sort((a, b) => a - b);

  const m = items.length;
  if (m <= 16) {
    let bestScore = -Infinity;
    let bestMask = 0;
    const total = 1 << m;
    for (let mask = 1; mask < total; mask++) {
      let chars = 0;
      let sc = 0;
      let count = 0;
      let m = mask;
      let idx = 0;
      let ok = true;
      while (m) {
        if (m & 1) {
          const it = items[idx];
          chars += it.len + (count ? 1 : 0);
          if (chars > limit) { ok = false; break; }
          sc += it.score;
          count++;
        }
        m >>= 1;
        idx++;
      }
      if (ok && count > 0 && sc > bestScore) {
        bestScore = sc;
        bestMask = mask;
      }
    }
    const out: number[] = [];
    for (let b = 0; b < m; b++) if (bestMask & (1 << b)) out.push(items[b].i);
    if (out.length === 0 && items.length) {
      // Hiçbir tek cümle bile sığmadıysa rezerve edilenler korunur.
      return finish([]);
    }
    return finish(out);
  }
  // Açgözlü (büyük girdiler): yoğunluk = puan / (uzunluk + 20)
  const byDensity = [...items].sort(
    (a, b) => b.score / (b.len + 20) - a.score / (a.len + 20)
  );
  const out: number[] = [];
  let used = 0;
  for (const it of byDensity) {
    const add = it.len + (out.length ? 1 : 0);
    if (used + add <= limit) { out.push(it.i); used += add; }
  }
  return finish(out);
}

export function compressTurkish(input: string, limit: number, options: CompressOptions = {}): CompressResult {
  const original = input ?? '';
  const originalLength = charLength(original);
  const mods: Modification[] = [];
  const warnings: string[] = [];
  const dropped: string[] = [];
  const protectedTerms = [
    ...(options.protectedTerms ?? []),
    ...extractProtectedTerms(original),
    ...extractUrls(original),
    ...extractMentions(original)
  ];
  const brandNames = options.brandNames ?? [];

  const fit = (t: string) => charLength(t) <= limit;

  // --- Aşama 0: temizlik ---------------------------------------------------
  let hashtags: string[] = [];
  let stage0 = original.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (options.stripHashtags) {
    hashtags = extractHashtagTokens(stage0);
    stage0 = stage0.replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  }
  if (fit(stage0)) {
    return finalize(stage0, 0);
  }

  // --- Aşama 1: ifade kısaltma --------------------------------------------
  let stage1 = applyPhrases(stage0, mods, PHRASE_RULES, false).trim();
  if (fit(stage1)) return finalize(stage1, 1);

  // --- Aşama 2: önem puanına göre cümle paketleme ---------------------------
  // Düşük puanlı cümleleri tek tek çıkarmak yerine, EN YÜKSEK puanlı
  // cümleleri bütçeye sığacak şekilde belge sırasını koruyarak seçeriz.
  // Böylece duyuru cümlesi ("Yeni sezon ... satışta") her zaman korunur.
  const sentences = splitSentences(stage1);
  let stage2 = stage1;
  if (sentences.length > 1) {
    const scored = sentences.map((s, i) => ({
      s,
      i,
      score: scoreSentence(s, i, sentences.length, protectedTerms, brandNames)
    }));
    const anchors = factAnchorIndexes(sentences, protectedTerms);
    const keepIdx = selectBestSubset(
      scored.map((x) => ({ i: x.i, len: charLength(x.s), score: x.score })),
      limit,
      { mustInclude: anchors }
    );
    if (keepIdx.length > 0) {
      keepIdx.sort((a, b) => a - b); // belge sırasını koru
      const packed = keepIdx.map((i) => sentences[i]).join(' ');
      stage2 = capitalizeFirst(packed);
      for (const sc of scored) {
        if (!keepIdx.includes(sc.i)) {
          dropped.push(sc.s);
          mods.push({
            stage: 'cümle',
            from: sc.s.slice(0, 120),
            to: '',
            reason: 'Karakter bütçesi için düşük öncelikli cümle çıkarıldı'
          });
        }
      }
      if (fit(stage2)) return finalize(stage2, 2);
    }
  }

  // --- Aşama 3: dolgu ve yan cümle sadeleştirme ------------------------------
  let stage3 = stage2;
  for (const [re] of FILLER_WORDS) stage3 = stage3.replace(re, ' ');
  stage3 = stage3.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim();
  if (stage3 !== stage2) mods.push({ stage: 'sadeleştirme', from: 'dolgu ifadeler', to: '', reason: 'Dolgu zarfları ve zayıf yan cümleler kaldırıldı' });
  if (fit(stage3)) return finalize(stage3, 3);

  // --- Aşama 4: sözcük kısaltma ---------------------------------------------
  let stage4 = stage3;
  for (const [re, rep] of WORD_RULES) stage4 = stage4.replace(re, rep);
  // Sıfat zincirlerini budama: "yeni ve özel koleksiyon" → "yeni koleksiyon"
  stage4 = stage4.replace(/\b(?:ve|ile)\s+(?:özel|yeni|güzel|şık|kaliteli|eşsiz|benzersiz)\b/gi, '');
  stage4 = stage4.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim();
  if (stage4 !== stage3) mods.push({ stage: 'sözcük', from: 'uzun ifadeler', to: '', reason: 'Sözcük düzeyinde kısaltma uygulandı' });
  if (fit(stage4)) return finalize(stage4, 4);

  // --- Aşama 5: SON ÇARE kesme ----------------------------------------------
  warnings.push(
    'Metin tüm anlamsal kısaltma aşamalarından sonra da sınıra sığmadı; son çare olarak sözcük sınırından kısaltıldı. Lütfen metni gözden geçirin.'
  );
  const hardLimit = limit;
  let stage5 = truncateAtSentenceBoundary(stage4, hardLimit);
  // Korunan terimleri geri ekle (bağlantı, fiyat, mention)
  const urls = extractUrls(original);
  for (const u of urls) {
    if (!stage5.includes(u) && charLength(stage5) + charLength(u) + 1 <= hardLimit) stage5 = `${stage5} ${u}`;
  }
  if (!/[.!?…]$/.test(stage5.trim())) stage5 = stage5.trim().replace(/[,;:]$/, '') + '…';
  mods.push({ stage: 'kesme', from: stage4.slice(0, 120), to: stage5.slice(0, 120), reason: 'Sözcük sınırında kısaltma (son çare)' });

  return finalize(stage5, 5);

  function finalize(text: string, stage: number): CompressResult {
    let clean = capitalizeFirst(text.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim());
    // Korunan terim doğrulaması: çıkarıldıysa uyar
    for (const term of protectedTerms) {
      if (!term) continue;
      if (term.startsWith('http') || term.startsWith('@')) continue; // URL/mention ayrıca işleniyor
      if (!clean.toLocaleLowerCase('tr-TR').includes(term.toLocaleLowerCase('tr-TR')) && original.toLocaleLowerCase('tr-TR').includes(term.toLocaleLowerCase('tr-TR'))) {
        warnings.push(`Korunması gereken bilgi metinde kalmadı: "${term}". Lütfen elle kontrol edin.`);
      }
    }
    if (hashtags.length) {
      // Hashtag'ler ayrı tutuluyor; sonuç metnine eklenmez.
    }
    if (stage >= 2 && dropped.length) {
      // Bilgi amaçlı: çıkarılan cümle sayısı
    }
    return {
      text: clean,
      originalLength,
      finalLength: charLength(clean),
      limit,
      shortened: stage > 0,
      truncated: stage === 5,
      stage,
      modifications: mods.slice(0, options.maxModifications ?? 12),
      warnings,
      dropped
    };
  }
}

/** Korunan terimlerin metinde kalıp kalmadığını doğrular. */
export function verifyProtectedTerms(text: string, terms: string[]): string[] {
  const missing: string[] = [];
  const lower = (text ?? '').toLocaleLowerCase('tr-TR');
  for (const t of terms) {
    if (!t) continue;
    if (!lower.includes(t.toLocaleLowerCase('tr-TR'))) missing.push(t);
  }
  return missing;
}

/** İlk harfi Türkçe kurallarına göre büyütür. */
export function capitalizeFirst(text: string): string {
  const t = (text ?? '').trim();
  if (!t) return t;
  return t.charAt(0).toLocaleUpperCase('tr-TR') + t.slice(1);
}

/**
 * Sözcük sınırında keser; mümkünse en yakın cümle sonunda bitirir.
 * Kesinti sonrası noktalama ve büyük harf düzeltilir.
 */
export function truncateAtSentenceBoundary(text: string, limit: number): string {
  const sentences = splitSentences(text);
  if (sentences.length > 1) {
    let acc = '';
    for (const s of sentences) {
      const trial = acc ? `${acc} ${s}` : s;
      if (charLength(trial) > limit) break;
      acc = trial;
    }
    if (acc && charLength(acc) >= limit * 0.45) return capitalizeFirst(acc.trim());
  }
  let out = truncateWords(text, limit);
  out = out.replace(/[,;:—-]+$/, '').trim();
  if (!/[.!?…]$/.test(out)) out = `${out}…`;
  return capitalizeFirst(out);
}

/** Emoji yoğunluğunu ayarlar. */
export function adjustEmojis(text: string, level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'): string {
  const EMOJI_RE = /\p{Extended_Pictographic}\uFE0F?/gu;
  if (level === 'NONE') return text.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
  const existing = text.match(EMOJI_RE) ?? [];
  const words = text.split(/\s+/).length;
  const target = level === 'LOW' ? Math.max(1, Math.round(words / 40)) : level === 'MEDIUM' ? Math.max(2, Math.round(words / 18)) : Math.max(3, Math.round(words / 9));
  if (existing.length >= target) return text;
  return text;
}
