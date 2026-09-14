import type { ContentStyle } from '../platforms/platforms';
import { CONTENT_STYLE_LABELS } from '../platforms/platforms';

/**
 * BrandVoiceService — marka tonu ve içerik stili.
 * AI uyarlamasının "ton" girdisini üretir ve LLM yoksa metne hafif biçimsel
 * dönüşümler uygular. Marka profiline varsayılan stil kaydedilebilir.
 */

export interface StyleProfile {
  code: ContentStyle;
  label: string;
  /** LLM'e verilen Türkçe ton talimatı. */
  prompt: string;
  formality: 'FORMAL' | 'NEUTRAL' | 'CASUAL';
  emojiLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  exclamation: 'NONE' | 'LOW' | 'MEDIUM';
  ctaStyle: string;
  openerHints: string[];
}

export const STYLE_PROFILES: Record<ContentStyle, StyleProfile> = {
  CORPORATE: {
    code: 'CORPORATE',
    label: CONTENT_STYLE_LABELS.CORPORATE,
    prompt:
      'Kurumsal, resmi ve ölçülü bir dil kullan. Üçüncü çoğul şahıs veya kurumsal "biz" dili tercih et. Emoji kullanma. Abartılı sıfatlardan kaçın, net ve güvenilir bir ton kur.',
    formality: 'FORMAL',
    emojiLevel: 'NONE',
    exclamation: 'NONE',
    ctaStyle: 'Detaylı bilgi için kurumsal web sitemizi ziyaret edin.',
    openerHints: ['Kurumumuz', 'Şirketimiz', 'Faaliyetlerimiz kapsamında']
  },
  PROFESSIONAL: {
    code: 'PROFESSIONAL',
    label: CONTENT_STYLE_LABELS.PROFESSIONAL,
    prompt:
      'Profesyonel ama erişilebilir bir dil kullan. Sektör terminolojisine hâkim, güven veren, gereksiz süslemelerden arınmış cümleler kur. Emoji çok az veya hiç olmasın.',
    formality: 'FORMAL',
    emojiLevel: 'LOW',
    exclamation: 'LOW',
    ctaStyle: 'Detayları incelemek için bağlantıyı kullanabilirsiniz.',
    openerHints: ['Yeni', 'Duyuru', 'Güncelleme']
  },
  FRIENDLY: {
    code: 'FRIENDLY',
    label: CONTENT_STYLE_LABELS.FRIENDLY,
    prompt:
      'Samimi, sıcak ve konuşma diline yakın yaz. Okuyucuya "sen/siz" diye hitap et. Kısa cümleler, doğal ünlemler ve ölçülü emoji kullan. Yapay reklam dili olmasın.',
    formality: 'CASUAL',
    emojiLevel: 'MEDIUM',
    exclamation: 'MEDIUM',
    ctaStyle: 'Hadi göz at, çok seveceksin!',
    openerHints: ['Selam!', 'Bunu çok seveceksin', 'Sana bir haberimiz var']
  },
  PREMIUM: {
    code: 'PREMIUM',
    label: CONTENT_STYLE_LABELS.PREMIUM,
    prompt:
      'Premium, rafine ve az ama öz yaz. Lüks marka dili: kısa, kendinden emin cümleler, boşluk hissi. Emoji kullanma, ünlem işaretinden kaçın. Ayrıntı yerine duygu ve statü vurgula.',
    formality: 'FORMAL',
    emojiLevel: 'NONE',
    exclamation: 'NONE',
    ctaStyle: 'Keşfetmek için bağlantıyı ziyaret edin.',
    openerHints: ['Zamansız', 'Özenle', 'Sınırlı sayıda']
  },
  MINIMAL: {
    code: 'MINIMAL',
    label: CONTENT_STYLE_LABELS.MINIMAL,
    prompt:
      'Minimal yaz. En fazla 1-2 kısa cümle. Sıfat ve zarfları budaya budaya ilerle. Emoji yok, ünlem yok. Ana mesaj dışında hiçbir şey bırakma.',
    formality: 'NEUTRAL',
    emojiLevel: 'NONE',
    exclamation: 'NONE',
    ctaStyle: 'Detaylar bağlantıda.',
    openerHints: ['Yeni.', 'Şimdi.', 'Burada.']
  },
  FUN: {
    code: 'FUN',
    label: CONTENT_STYLE_LABELS.FUN,
    prompt:
      'Eğlenceli, enerjik ve oyunbaz yaz. Kısa cümleler, kelime oyunları, emoji. Abartıya kaçmadan mizah kullan. Okuyucuyu gülümsetecek bir ton kur.',
    formality: 'CASUAL',
    emojiLevel: 'HIGH',
    exclamation: 'MEDIUM',
    ctaStyle: 'Kaçırma, hemen tıkla! 🎉',
    openerHints: ['Tahmin et ne oldu?', 'Hazır mısın?', 'Bugün biraz şımarıyoruz']
  },
  SALES: {
    code: 'SALES',
    label: CONTENT_STYLE_LABELS.SALES,
    prompt:
      'Satış odaklı yaz: fayda → kanıt → aciliyet → net CTA sırasını izle. Fiyat, indirim ve tarih bilgisi YALNIZCA verildiyse kullan, asla uydurma. Kısa ve harekete geçiren cümleler kur.',
    formality: 'NEUTRAL',
    emojiLevel: 'MEDIUM',
    exclamation: 'MEDIUM',
    ctaStyle: 'Şimdi sipariş ver, fırsatı kaçırma.',
    openerHints: ['Fırsat', 'Kaçırmayın', 'Bugüne özel']
  },
  INFORMATIVE: {
    code: 'INFORMATIVE',
    label: CONTENT_STYLE_LABELS.INFORMATIVE,
    prompt:
      'Bilgilendirici yaz. Madde madde, net ve tarafsız anlat. Sayısal veri ve özellikleri koru. Satış dili kullanma; okuyucuya karar vermesi için gereken bilgiyi ver.',
    formality: 'NEUTRAL',
    emojiLevel: 'LOW',
    exclamation: 'NONE',
    ctaStyle: 'Tamamı için bağlantıyı inceleyin.',
    openerHints: ['Bilmeniz gerekenler', 'Özet', 'Neler değişti?']
  },
  STORYTELLING: {
    code: 'STORYTELLING',
    label: CONTENT_STYLE_LABELS.STORYTELLING,
    prompt:
      'Hikâye anlatımı kullan: bir sahne veya sorunla başla, gelişme kur, çözüme bağla. Duyusal ayrıntılar ekle ama uydurma bilgi verme. İlk cümle merak uyandırsın.',
    formality: 'NEUTRAL',
    emojiLevel: 'LOW',
    exclamation: 'LOW',
    ctaStyle: 'Hikâyenin devamı bağlantıda.',
    openerHints: ['Her şey bir sabah başladı', 'Bunu kimse beklemiyordu', 'İlk denememizde']
  },
  LAUNCH: {
    code: 'LAUNCH',
    label: CONTENT_STYLE_LABELS.LAUNCH,
    prompt:
      'Lansman dili kullan: bekleyiş → duyuru → öne çıkan özellik → net tarih/CTA. Heyecanlı ama abartısız ol. Tarih ve saat bilgisi verildiyse mutlaka koru.',
    formality: 'NEUTRAL',
    emojiLevel: 'MEDIUM',
    exclamation: 'MEDIUM',
    ctaStyle: 'Bugün itibarıyla yayında — hemen inceleyin.',
    openerHints: ['Ve işte burada', 'Bekleyiş sona erdi', 'Karşınızda']
  },
  CAMPAIGN: {
    code: 'CAMPAIGN',
    label: CONTENT_STYLE_LABELS.CAMPAIGN,
    prompt:
      'Kampanya dili kullan: teklif, geçerlilik süresi, koşullar, CTA. İndirim oranı ve tarihler YALNIZCA kullanıcı verdiyse yazılır. Koşulları atlamadan kısalt.',
    formality: 'NEUTRAL',
    emojiLevel: 'MEDIUM',
    exclamation: 'MEDIUM',
    ctaStyle: 'Kampanyadan yararlanmak için şimdi tıklayın.',
    openerHints: ['Kampanya başladı', 'Sınırlı süreyle', 'Bu hafta sonu']
  },
  ANNOUNCEMENT: {
    code: 'ANNOUNCEMENT',
    label: CONTENT_STYLE_LABELS.ANNOUNCEMENT,
    prompt:
      'Duyuru dili kullan: ne, ne zaman, kimi ilgilendiriyor, ne yapmalı. Kısa, resmi olmayan ama net bir ton. İlk cümlede duyurunun özü yer alsın.',
    formality: 'NEUTRAL',
    emojiLevel: 'LOW',
    exclamation: 'LOW',
    ctaStyle: 'Detaylar için bağlantıyı ziyaret edin.',
    openerHints: ['Duyuru', 'Önemli bilgi', 'Bilginize']
  }
};

export interface BrandVoiceInput {
  tone?: string | null;
  personality?: string | null;
  audience?: string | null;
  allowedTerms?: string[];
  bannedTerms?: string[];
  mustKeepTerms?: string[];
  formality?: string | null;
  emojiLevel?: string | null;
  language?: string;
}

/** LLM sistem istemine eklenecek marka sesi bloğu. */
export function buildBrandVoicePrompt(voice: BrandVoiceInput | null | undefined, style: ContentStyle): string {
  const profile = STYLE_PROFILES[style] ?? STYLE_PROFILES.PROFESSIONAL;
  const lines = [`İÇERİK STİLİ: ${profile.label}`, profile.prompt];
  if (voice?.tone) lines.push(`MARKA TONU: ${voice.tone}`);
  if (voice?.personality) lines.push(`MARKA KİŞİLİĞİ: ${voice.personality}`);
  if (voice?.audience) lines.push(`HEDEF KİTLE: ${voice.audience}`);
  if (voice?.allowedTerms?.length) lines.push(`KULLANILABİLECEK İFADELER: ${voice.allowedTerms.join(', ')}`);
  if (voice?.bannedTerms?.length) lines.push(`KAÇINILACAK İFADELER (asla kullanma): ${voice.bannedTerms.join(', ')}`);
  if (voice?.mustKeepTerms?.length) lines.push(`METİNDE AYNEN KALMASI GEREKENLER: ${voice.mustKeepTerms.join(', ')}`);
  lines.push(`EMOJİ YOĞUNLUĞU: ${profile.emojiLevel}`);
  lines.push(`RESMİYET: ${profile.formality}`);
  lines.push('DİL: Türkçe (doğal, akıcı, reklam klişelerinden uzak).');
  return lines.join('\n');
}

/**
 * LLM yoksa uygulanan hafif stil dönüşümü.
 * Anlamı değiştirmez; yalnızca biçim (emoji/ünlem/yasaklı kelime) düzenler.
 */
export function applyStyleLocally(text: string, style: ContentStyle, voice?: BrandVoiceInput | null): string {
  const profile = STYLE_PROFILES[style] ?? STYLE_PROFILES.PROFESSIONAL;
  let out = text ?? '';

  // Emoji yoğunluğu
  const EMOJI_RE = /\p{Extended_Pictographic}\uFE0F?/gu;
  const emojis = out.match(EMOJI_RE) ?? [];
  if (profile.emojiLevel === 'NONE' && emojis.length) {
    out = out.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
  } else if (profile.emojiLevel === 'LOW' && emojis.length > 2) {
    let n = emojis.length - 2;
    out = out.replace(EMOJI_RE, (m) => (n-- > 0 ? '' : m)).replace(/\s{2,}/g, ' ').trim();
  }

  // Ünlem yoğunluğu
  if (profile.exclamation === 'NONE') {
    out = out.replace(/!{2,}/g, '.').replace(/!/g, '.');
    out = out.replace(/\.\s*([a-zçğıöşü])/g, (_m, p1: string) => `. ${p1.toLocaleUpperCase('tr-TR')}`);
  } else if (profile.exclamation === 'LOW') {
    out = out.replace(/!{2,}/g, '!');
  }

  // Yasaklı kelimeler
  for (const banned of voice?.bannedTerms ?? []) {
    const term = banned.trim();
    if (!term) continue;
    out = out.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi'), '');
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Marka sesinden emoji düzeyini çöz. */
export function resolveEmojiLevel(style: ContentStyle, voice?: BrandVoiceInput | null): 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' {
  const fromVoice = voice?.emojiLevel as 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | undefined;
  if (fromVoice && ['NONE', 'LOW', 'MEDIUM', 'HIGH'].includes(fromVoice)) return fromVoice;
  return (STYLE_PROFILES[style] ?? STYLE_PROFILES.PROFESSIONAL).emojiLevel;
}

export const STYLE_LIST = Object.values(STYLE_PROFILES);
