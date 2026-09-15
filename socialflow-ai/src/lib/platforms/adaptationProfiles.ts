/**
 * Metin uyarlama profilleri (§35–§37)
 * ---------------------------------------------------------------------------
 * Her platform + içerik türü için METİN KURGUSU burada tanımlanır: hedef
 * uzunluk, emoji düzeyi, hashtag bütçesi, satır yapısı, ton ve CTA tarzı.
 *
 * NEDEN AYRI DOSYA: Platform kuralları (karakter sınırı, medya ölçüsü) veritabanında
 * `PlatformRule` olarak tutulur ve değişkendir. Buradaki profil ise YAZIM
 * KURGUSUDUR (ör. "Hikaye metni kısa ve emir kipinde olur") ve kural kaydından
 * bağımsız olarak uyarlama motorunu yönlendirir. Kullanıcı arayüzünde veya
 * React bileşenlerinde ASLA sabitlenmez; tek doğruluk kaynağı burasıdır.
 *
 * Hedef uzunluk `preferredRatio`: kuralın önerilen uzunluğuna oran. Böylece
 * kural güncellendiğinde (ör. X limiti değiştiğinde) profil otomatik uyum sağlar.
 */

import type { ContentType, PlatformCode } from './platforms';

export interface AdaptationProfile {
  /** Kısa açıklama (kullanıcı arayüzü ipucu ve denetim için). */
  summary: string;
  /**
   * Hedef uzunluk: `min(limit, recommendedLength)` üzerine uygulanacak oran.
   * 1 = kuralın önerdiği uzunluğu kullan, <1 = daha kısa yaz, >1 = daha uzun.
   */
  preferredRatio: number;
  /** Hedef uzunluğun üst sınırı (kural ne derse desin aşılmaz). */
  maxPreferredLength?: number;
  /** Hedef uzunluğun alt sınırı — çok kısa metinler bozulmasın. */
  minPreferredLength?: number;
  /** Emoji yoğunluğu. */
  emojiLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  /** Bu hedefte kullanılabilecek EN FAZLA hashtag sayısı. */
  hashtagBudget: number;
  /** Hashtag yerleşimi önerisi. */
  hashtagPlacement?: 'INLINE' | 'FIRST_COMMENT' | 'SEPARATE';
  /** CTA tarzı: kısa eylem çağrısı mı, yoksa daha anlatısal mı? */
  ctaStyle: 'MINIMAL' | 'ACTION' | 'CONVERSATIONAL' | 'PROFESSIONAL' | 'NONE';
  /** Ton ipucu (yerel motor cümle seçiminde kullanır). */
  tone: 'PUNCHY' | 'WARM' | 'PROFESSIONAL' | 'NEUTRAL';
  /** Maksimum cümle sayısı önerisi (yerel motor buna göre seçim yapar). */
  sentenceTarget?: number;
}

const FEED_LIKE: AdaptationProfile = {
  summary: 'Gönderi: açıklayıcı gövde, kısa CTA, orta düzey emoji',
  preferredRatio: 1,
  emojiLevel: 'LOW',
  hashtagBudget: 8,
  ctaStyle: 'ACTION',
  tone: 'WARM',
  sentenceTarget: 4
};

export const ADAPTATION_PROFILES: Partial<Record<PlatformCode, Partial<Record<ContentType, AdaptationProfile>>>> = {
  INSTAGRAM: {
    FEED: { ...FEED_LIKE, emojiLevel: 'MEDIUM', hashtagBudget: 10, tone: 'WARM' },
    STORY: {
      summary: 'Hikaye: çok kısa, vurucu, tek mesaj + tek eylem çağrısı',
      preferredRatio: 1,
      maxPreferredLength: 160,
      minPreferredLength: 40,
      emojiLevel: 'LOW',
      hashtagBudget: 1,
      ctaStyle: 'MINIMAL',
      tone: 'PUNCHY',
      sentenceTarget: 1
    },
    REEL: {
      summary: 'Reels: kısa kanca + tek satır bağlam',
      preferredRatio: 1,
      maxPreferredLength: 240,
      minPreferredLength: 50,
      emojiLevel: 'MEDIUM',
      hashtagBudget: 6,
      ctaStyle: 'ACTION',
      tone: 'PUNCHY',
      sentenceTarget: 2
    }
  },
  FACEBOOK: {
    FEED: { ...FEED_LIKE, hashtagBudget: 4, ctaStyle: 'CONVERSATIONAL', sentenceTarget: 5 }
  },
  X: {
    POST: {
      summary: 'X gönderisi: kısa, net, etiketten çok içerik odaklı',
      preferredRatio: 1,
      emojiLevel: 'LOW',
      hashtagBudget: 2,
      ctaStyle: 'MINIMAL',
      tone: 'PUNCHY',
      sentenceTarget: 2
    }
  },
  LINKEDIN: {
    POST: {
      summary: 'LinkedIn: profesyonel dil, daha az emoji, kurumsal CTA',
      preferredRatio: 1,
      emojiLevel: 'NONE',
      hashtagBudget: 3,
      ctaStyle: 'PROFESSIONAL',
      tone: 'PROFESSIONAL',
      sentenceTarget: 4
    },
    PROFILE_POST: {
      summary: 'LinkedIn profil gönderisi: kişisel ama profesyonel ton',
      preferredRatio: 1,
      emojiLevel: 'LOW',
      hashtagBudget: 3,
      ctaStyle: 'PROFESSIONAL',
      tone: 'PROFESSIONAL',
      sentenceTarget: 4
    }
  },
  THREADS: {
    POST: {
      summary: 'Threads: sohbet tonu, kısa paragraf',
      preferredRatio: 1,
      maxPreferredLength: 400,
      emojiLevel: 'LOW',
      hashtagBudget: 3,
      ctaStyle: 'CONVERSATIONAL',
      tone: 'WARM',
      sentenceTarget: 3
    }
  },
  TIKTOK: {
    VIDEO: {
      summary: 'TikTok: kısa kanca, akış dili',
      preferredRatio: 1,
      maxPreferredLength: 200,
      emojiLevel: 'HIGH',
      hashtagBudget: 5,
      ctaStyle: 'MINIMAL',
      tone: 'PUNCHY',
      sentenceTarget: 2
    }
  },
  YOUTUBE: {
    VIDEO: { ...FEED_LIKE, emojiLevel: 'LOW', hashtagBudget: 5, ctaStyle: 'ACTION', sentenceTarget: 5 },
    SHORTS: {
      summary: 'Shorts: tek cümlelik kanca',
      preferredRatio: 1,
      maxPreferredLength: 140,
      minPreferredLength: 30,
      emojiLevel: 'LOW',
      hashtagBudget: 2,
      ctaStyle: 'MINIMAL',
      tone: 'PUNCHY',
      sentenceTarget: 1
    }
  },
  PINTEREST: {
    PIN: { ...FEED_LIKE, emojiLevel: 'NONE', hashtagBudget: 4, ctaStyle: 'ACTION', tone: 'NEUTRAL', sentenceTarget: 3 }
  },
  GOOGLE_BUSINESS: {
    LOCAL_POST: {
      summary: 'Google İşletme: bilgilendirici, yerel, sade',
      preferredRatio: 1,
      maxPreferredLength: 700,
      emojiLevel: 'NONE',
      hashtagBudget: 0,
      hashtagPlacement: 'SEPARATE',
      ctaStyle: 'ACTION',
      tone: 'NEUTRAL',
      sentenceTarget: 4
    }
  }
};

/** Genel varsayılan: profili olmayan platform/içerik türleri için. */
export const DEFAULT_ADAPTATION_PROFILE: AdaptationProfile = {
  summary: 'Genel gönderi kurgusu',
  preferredRatio: 1,
  emojiLevel: 'LOW',
  hashtagBudget: 5,
  ctaStyle: 'ACTION',
  tone: 'NEUTRAL',
  sentenceTarget: 4
};

export function adaptationProfile(platform: string, contentType: string): AdaptationProfile {
  const byPlatform = ADAPTATION_PROFILES[platform as PlatformCode];
  const profile = byPlatform?.[contentType as ContentType];
  return profile ? { ...DEFAULT_ADAPTATION_PROFILE, ...profile } : DEFAULT_ADAPTATION_PROFILE;
}

/**
 * Hedef metin uzunluğunu hesaplar.
 * `rulePreferredLength` kural tablosundan gelir; profil oranı uygulanır ve
 * profil sınırları (max/min) ile kırpılır.
 */
export function targetLengthFor(profile: AdaptationProfile, rulePreferredLength: number, hardLimit: number): number {
  const base = Math.max(40, rulePreferredLength || hardLimit);
  const scaled = Math.round(base * profile.preferredRatio);
  const capped = profile.maxPreferredLength ? Math.min(scaled, profile.maxPreferredLength) : scaled;
  const floored = Math.max(capped, profile.minPreferredLength ?? 0);
  return Math.max(30, Math.min(floored, hardLimit));
}
