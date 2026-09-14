import prisma from '../prisma';
import {
  buildHashtagBlock,
  charLength,
  extractHashtagTokens,
  normalizeTag,
  toTurkishLower
} from '../text';
import type { HashtagGroup } from '../platforms/platforms';
import { HASHTAG_GROUP_LABELS } from '../platforms/platforms';

/**
 * HashtagService — "AI Hashtag Önerileri"
 * ---------------------------------------------------------------------------
 * Her platform için ayrı strateji uygular; gönderiyi gereksiz etiketle
 * DOLDURMAZ. Tekrar eden, alakasız ve yasaklı/güvensiz etiketleri eler.
 */

export interface HashtagSuggestion {
  tag: string; // '#' olmadan
  group: HashtagGroup;
  groupLabel: string;
  reason: string; // Türkçe gerekçe
  score: number;
  blocked?: boolean;
  blockedReason?: string;
}

export interface HashtagOptimizeInput {
  text: string;
  brandName?: string | null;
  defaultHashtags?: string[];
  requiredHashtags?: string[];
  bannedHashtags?: string[];
  campaignName?: string | null;
  location?: string | null;
  maxHashtags: number;
  recommendedHashtags: number;
  workspaceId?: string;
  contentType?: string;
}

export interface HashtagOptimizeResult {
  selected: HashtagSuggestion[];
  groups: { group: HashtagGroup; label: string; items: HashtagSuggestion[] }[];
  block: string;
  removedDuplicates: string[];
  removedBlocked: string[];
  note: string;
}

/** Türkçe durak sözcükler — etiket üretiminde kullanılmaz. */
const STOPWORDS = new Set(
  `ve veya ile için ama fakat çünkü bu şu o bunlar şunlar onlar bir iki çok daha en kadar gibi göre göre
   yani ayrıca hem ne mi mı mu mü de da ki ise çok daha çok yeni şimdi bugün yarın hemen burada orada
   siz sen ben biz onlar bize size bizim sizin benim senin çok fazla biraz birazcık oldukça
   the a an and or of to in for on with is are be this that it you we our your their
   olarak üzere ile birlikte hakkında karşı rağmen dolayı ötürü itibaren
   her hiçbir bazı birçok pek çok az en çok`.split(/\s+/)
);

const GENERIC_SUFFIXES = ['türkiye', 'öneri', 'fırsat', 'yenilik', 'kalite'];

/** Metinden anahtar sözcük çıkarır (basit TF tabanlı). */
export function extractKeywords(text: string, limit = 12): string[] {
  const words = toTurkishLower(text ?? '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/#\S+/g, ' ')
    .replace(/@\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([w]) => w);
}

/** Marka adından etiket üretir: "Kahve Dükkanı" → kahvedukkani */
export function brandTag(name?: string | null): string | null {
  if (!name) return null;
  const cleaned = toTurkishLower(name)
    .replace(/[çğ]/g, (m) => (m === 'ç' ? 'c' : 'g'))
    .replace(/[öü]/g, (m) => (m === 'ö' ? 'o' : 'u'))
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/[^\p{L}\p{N}]/gu, '');
  return cleaned.length > 2 ? cleaned : null;
}

/** Yaygın bilinen riskli/yasaklı etiket kalıpları (tanımlanabildiği kadarıyla). */
const KNOWN_UNSAFE_PATTERNS: { re: RegExp; reason: string }[] = [
  {
    re: /^(like4like|l4l|follow4follow|f4f|followforfollow)$/i,
    reason: 'Etkileşim takası etiketleri platformlar tarafından spam olarak işaretlenir.'
  },
  {
    re: /^(instagram|instagood|instadaily|photooftheday|love|beautiful|happy)$/i,
    reason: 'Aşırı doygun genel etiket: gönderinizin keşfedilme olasılığını düşürür.'
  },
  { re: /^(adult|nsfw|xxx)/i, reason: 'Yetişkin içerik etiketi — hesap kısıtlamasına yol açabilir.' }
];

export function checkTagSafety(tag: string): { safe: boolean; reason?: string } {
  const t = normalizeTag(tag);
  if (!t) return { safe: false, reason: 'Etiket boş olamaz.' };
  if (t.length < 2) return { safe: false, reason: 'Etiket en az 2 karakter olmalıdır.' };
  if (t.length > 60) return { safe: false, reason: 'Etiket çok uzun.' };
  for (const p of KNOWN_UNSAFE_PATTERNS) {
    if (p.re.test(t)) return { safe: false, reason: p.reason };
  }
  return { safe: true };
}

export async function generateHashtags(input: HashtagOptimizeInput): Promise<HashtagOptimizeResult> {
  const banned = new Set((input.bannedHashtags ?? []).map(normalizeTag).filter(Boolean));
  const required = Array.from(new Set((input.requiredHashtags ?? []).map(normalizeTag).filter(Boolean)));
  const defaults = Array.from(new Set((input.defaultHashtags ?? []).map(normalizeTag).filter(Boolean)));

  const inText = extractHashtagTokens(input.text);
  const keywords = extractKeywords(input.text, 10);
  const bTag = brandTag(input.brandName);
  const campaignTag = input.campaignName ? brandTag(input.campaignName) : null;

  // Trend etiketleri (çalışma alanı veritabanından; kullanım sayısına göre)
  let trendTags: { tag: string; usageCount: number }[] = [];
  if (input.workspaceId) {
    try {
      trendTags = await prisma.hashtagEntry.findMany({
        where: { workspaceId: input.workspaceId, group: 'TREND', blocked: false },
        orderBy: { usageCount: 'desc' },
        take: 12,
        select: { tag: true, usageCount: true }
      });
    } catch {
      trendTags = [];
    }
  }

  const pool: HashtagSuggestion[] = [];
  const push = (tag: string | null, group: HashtagGroup, reason: string, score: number) => {
    if (!tag) return;
    const t = normalizeTag(tag);
    if (!t) return;
    pool.push({ tag: t, group, groupLabel: HASHTAG_GROUP_LABELS[group], reason, score });
  };

  // Zorunlu
  for (const t of required) push(t, 'BRAND', 'Zorunlu hashtag — marka profili', 100);
  // Metinde zaten geçenler
  for (const t of inText) push(t, 'GENERAL', 'Ana açıklamada zaten kullanıldı', 60);
  // Marka
  if (bTag) push(bTag, 'BRAND', 'Marka adı etiketi', 70);
  for (const t of defaults) push(t, 'BRAND', 'Marka varsayılan etiketi', 55);
  // Kampanya
  if (campaignTag) push(campaignTag, 'CAMPAIGN', 'Kampanya adı etiketi', 65);
  // Niş (anahtar sözcükler)
  keywords.forEach((k, i) => push(k, 'NICHE', 'Metindeki anahtar sözcük', 50 - i * 2));
  keywords.slice(0, 4).forEach((k) => push(`${k}${GENERIC_SUFFIXES[0]}`, 'NICHE', 'Anahtar sözcük birleşimi', 28));
  // Lokasyon
  if (input.location) {
    push(brandTag(input.location), 'LOCATION', 'Lokasyon etiketi', 45);
    push(`${brandTag(input.location)}${bTag ?? ''}`, 'LOCATION', 'Lokasyon + marka', 35);
  }
  // Trend
  trendTags.forEach((t, i) => push(t.tag, 'TREND', `Yüksek kullanım (${t.usageCount})`, 40 - i));

  // Güvenlik + yasaklı + tekilleştirme
  const removedBlocked: string[] = [];
  const seen = new Map<string, HashtagSuggestion>();
  for (const s of pool) {
    if (banned.has(s.tag)) {
      removedBlocked.push(s.tag);
      continue;
    }
    const safety = checkTagSafety(s.tag);
    if (!safety.safe) {
      removedBlocked.push(s.tag);
      s.blocked = true;
      s.blockedReason = safety.reason;
      continue;
    }
    const existing = seen.get(s.tag);
    if (!existing || s.score > existing.score) seen.set(s.tag, s);
  }

  const deduped = Array.from(seen.values()).sort((a, b) => b.score - a.score);
  const removedDuplicates = pool.length - deduped.length > 0 ? [] : [];

  // Bütçe: platformun önerdiği sayıyı aşma (maxHashtags tavan)
  const target = Math.max(
    0,
    Math.min(input.recommendedHashtags || input.maxHashtags || 0, input.maxHashtags || 0)
  );
  const selected = target === 0 ? [] : deduped.slice(0, target);

  // Zorunlu etiketler seçime giremediyse ekle (limit izin veriyorsa)
  for (const t of required) {
    if (!selected.some((s) => s.tag === t) && selected.length < (input.maxHashtags || target)) {
      const found = deduped.find((d) => d.tag === t);
      if (found) selected.push(found);
    }
  }

  const groups: HashtagOptimizeResult['groups'] = (['GENERAL', 'NICHE', 'BRAND', 'CAMPAIGN', 'LOCATION', 'TREND'] as HashtagGroup[]).map(
    (g) => ({
      group: g,
      label: HASHTAG_GROUP_LABELS[g],
      items: deduped.filter((d) => d.group === g).slice(0, 12)
    })
  );

  const note =
    target === 0
      ? 'Bu platform/içerik türü için hashtag önerilmiyor.'
      : selected.length < target
        ? `Uygun ${selected.length} etiket bulundu; gereksiz etiketlerle doldurulmadı.`
        : `${input.recommendedHashtags || target} etiketlik platform önerisine göre seçildi.`;

  return {
    selected,
    groups,
    block: buildHashtagBlock(selected.map((s) => s.tag)),
    removedDuplicates,
    removedBlocked: Array.from(new Set(removedBlocked)),
    note
  };
}

/** Etiketleri açıklamanın sonuna ekler; sınırı aşmaz. */
export function appendHashtags(caption: string, block: string, limit: number): { caption: string; added: boolean } {
  if (!block) return { caption, added: false };
  const candidate = `${caption.trim()}\n\n${block}`.trim();
  if (charLength(candidate) > limit) {
    // Sığmıyorsa etiketleri azalt
    const tags = block.split(/\s+/);
    let out = caption.trim();
    for (let i = tags.length; i > 0; i--) {
      const trial = `${out}\n\n${tags.slice(0, i).join(' ')}`;
      if (charLength(trial) <= limit) return { caption: trial, added: true };
    }
    return { caption, added: false };
  }
  return { caption: candidate, added: true };
}

export { buildHashtagBlock, normalizeTag };
