/**
 * Metin analizi yardımcıları — Türkçe içerik için.
 * Karakter sayımı Unicode kod noktaları (grapheme) üzerinden yapılır, böylece
 * emoji ve Türkçe karakterler doğru hesaplanır.
 */

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const MENTION_RE = /@[\p{L}\p{N}_.]+/gu;
const URL_RE = /https?:\/\/[^\s<>")\]]+/gi;

/** Unicode kod noktası sayısı (emoji = 1 karakter sayılır). */
export function charLength(text: string): number {
  if (!text) return 0;
  return Array.from(text).length;
}

/**
 * Ağırlıklı uzunluk. X/Twitter bağlantıları 23 karakter olarak sayar.
 * Diğer platformlar için charLength ile aynıdır.
 */
export function weightedLength(text: string, urlWeight = 0): number {
  if (!text) return 0;
  const urls = text.match(URL_RE) ?? [];
  if (!urlWeight || urls.length === 0) return charLength(text);
  let total = charLength(text);
  for (const u of urls) total += urlWeight - charLength(u);
  return Math.max(0, total);
}

export function wordCount(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function emojiCount(text: string): number {
  if (!text) return 0;
  return (text.match(EMOJI_RE) ?? []).length;
}

export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const raw = text.match(HASHTAG_RE) ?? [];
  return Array.from(new Set(raw.map((t) => t.toLowerCase())));
}

export function extractHashtagTokens(text: string): string[] {
  if (!text) return [];
  return Array.from(new Set((text.match(HASHTAG_RE) ?? []).map((t) => t.replace(/^#/, '').toLowerCase())));
}

export function extractMentions(text: string): string[] {
  if (!text) return [];
  return Array.from(new Set(text.match(MENTION_RE) ?? []));
}

export function extractUrls(text: string): string[] {
  if (!text) return [];
  return Array.from(new Set(text.match(URL_RE) ?? []));
}

export interface TextStats {
  characters: number;
  words: number;
  emojis: number;
  hashtags: string[];
  mentions: string[];
  urls: string[];
  lines: number;
  readingTimeSec: number;
}

export function analyzeText(text: string): TextStats {
  const safe = text ?? '';
  return {
    characters: charLength(safe),
    words: wordCount(safe),
    emojis: emojiCount(safe),
    hashtags: extractHashtagTokens(safe),
    mentions: extractMentions(safe),
    urls: extractUrls(safe),
    lines: safe.split(/\r?\n/).filter((l) => l.trim().length).length,
    readingTimeSec: Math.round((wordCount(safe) / 200) * 60)
  };
}

/** Emoji'leri metinden çıkarır (kalan boşlukları temizler). */
export function stripEmojis(text: string): string {
  return (text ?? '').replace(EMOJI_RE, '').replace(/ {2,}/g, ' ').trim();
}

/** Hashtag satırlarını metinden ayırır. */
export function splitHashtags(text: string): { body: string; hashtags: string[] } {
  const hashtags = extractHashtagTokens(text);
  const body = (text ?? '')
    .replace(HASHTAG_RE, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { body, hashtags };
}

export function buildHashtagBlock(tags: string[]): string {
  const cleaned = Array.from(new Set(tags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean)));
  return cleaned.map((t) => `#${t}`).join(' ');
}

/** Türkçe cümlelere ayırır. Kısaltmalara (ör. vb., Dr.) karşı temkinlidir. */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  const abbrev = /\b(vb|vs|ör|Dr|Prof|A\.Ş|Ltd|St|No|İst)\./g;
  const protectedText = text.replace(abbrev, (m) => m.replace('.', '\u0000'));
  const parts = protectedText
    .split(/(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ0-9"“(@#])/u)
    .map((s) => s.replace(/\u0000/g, '.').trim())
    .filter(Boolean);
  return parts.length ? parts : [text.trim()].filter(Boolean);
}

/** Satır/paragraf bazlı bölümleme — AI kısaltmada korunur. */
export function splitBlocks(text: string): string[] {
  return (text ?? '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Fiyat, tarih, yüzde, telefon gibi "korunması gereken" varlıkları bulur. */
export function extractProtectedTerms(text: string): string[] {
  if (!text) return [];
  const patterns: RegExp[] = [
    /\d+(?:[.,]\d+)?\s?(?:TL|TRY|USD|EUR|GBP)\b/gi, // harfli para birimi (150 TL)
    /\d+(?:[.,]\d+)?\s?(?:₺|\$|€|£)/gi, // sembol sonda (120 ₺)
    /(?:₺|\$|€|£)\s?\d+(?:[.,]\d+)?/gi, // sembol önde (₺100)
    /%\s?\d+(?:[.,]\d+)?/g, // indirim yüzdesi (%15)
    /\b(?:yüzde|pct)\s?\d+(?:[.,]\d+)?/gi, // yüzde 15
    /\b\d{1,2}\s?(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)(?:\s?\d{4})?\b/gi,
    /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, // 12.09.2026
    /\b\d{1,2}:\d{2}\b/g, // 18:00
    /\b0?\d{3}\s?\d{3}\s?\d{2}\s?\d{2}\b/g, // telefon
    URL_RE,
    MENTION_RE,
    HASHTAG_RE
  ];
  const found = new Set<string>();
  for (const p of patterns) {
    for (const m of text.match(p) ?? []) found.add(m.trim());
  }
  return Array.from(found);
}

/** Büyük harfe çevirirken Türkçe karakterleri doğru işler (i → İ). */
export function toTurkishUpper(s: string): string {
  return s.replace(/i/g, 'İ').replace(/ı/g, 'I').toLocaleUpperCase('tr-TR');
}

export function toTurkishLower(s: string): string {
  return s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr-TR');
}

export function normalizeTag(tag: string): string {
  return toTurkishLower(tag)
    .replace(/^#/, '')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .trim();
}

export function truncateWords(text: string, maxChars: number): string {
  if (charLength(text) <= maxChars) return text;
  const words = text.split(/\s+/);
  let out = '';
  for (const w of words) {
    if (charLength(out) + charLength(w) + 1 > maxChars) break;
    out += (out ? ' ' : '') + w;
  }
  return out.trim();
}
