import type { ContentType, PlatformCode } from './platforms';

/**
 * Yerleşik (builtin) platform kuralları — YALNIZCA veritabanı tohumlaması için.
 *
 * ÖNEMLİ: Uygulama çalışma zamanında bu dosyayı DEĞİL, `PlatformRule`
 * tablosunu okur (bkz. src/lib/rules/ruleEngine.ts). Böylece sosyal medya
 * API'leri değiştikçe limitler Admin Ayarları'ndan veya bir kural senkron
 * işinden güncellenebilir; kod değişikliği gerekmez.
 *
 * Değerler genel olarak kamuya açık platform dokümantasyonundan alınmıştır ve
 * varsayılan başlangıç noktasıdır. Üretimde kendi hesap tiplerinize göre
 * doğrulayın.
 */

export interface BuiltinRule {
  platform: PlatformCode;
  contentType: ContentType;
  label: string;
  maxCaptionLength: number;
  recommendedCaptionLength: number;
  minCaptionLength?: number;
  supportedAspectRatios: string[];
  recommendedAspectRatio: string;
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  maxFileSize: number; // bayt (görsel)
  maxVideoFileSize?: number;
  supportedMimeTypes: string[];
  supportedImageFormats?: string[];
  supportedVideoFormats?: string[];
  maxVideoDuration?: number; // saniye
  minVideoDuration?: number;
  maxMediaCount?: number;
  maxHashtags?: number;
  recommendedHashtags?: number;
  hashtagRecommendation?: string[];
  supportsLinks?: boolean;
  clickableLinks?: boolean;
  supportsStories?: boolean;
  supportsCarousel?: boolean;
  supportsReels?: boolean;
  supportsScheduling?: boolean;
  supportsFirstComment?: boolean;
  supportsLocation?: boolean;
  supportsMentions?: boolean;
  supportsAltText?: boolean;
  supportsThreads?: boolean;
  safeArea?: { top: number; bottom: number; left: number; right: number };
  restrictions?: string[];
  apiVersion?: string;
  capabilities?: string[];
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Hikaye/Reels/Shorts/TikTok için arayüz güvenli alanları (oransal). */
const STORY_SAFE_AREA = { top: 0.14, bottom: 0.2, left: 0.06, right: 0.06 };

export const BUILTIN_RULES: BuiltinRule[] = [
  // ------------------------------- INSTAGRAM -------------------------------
  {
    platform: 'INSTAGRAM',
    contentType: 'FEED',
    label: 'Instagram Gönderisi',
    maxCaptionLength: 2200,
    recommendedCaptionLength: 400,
    supportedAspectRatios: ['1:1', '4:5', '1.91:1'],
    recommendedAspectRatio: '4:5',
    minWidth: 320,
    minHeight: 320,
    maxWidth: 1440,
    maxHeight: 1800,
    maxFileSize: 8 * MB,
    maxVideoFileSize: 650 * MB,
    supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'],
    supportedImageFormats: ['jpg', 'jpeg', 'png', 'webp'],
    supportedVideoFormats: ['mp4', 'mov'],
    maxVideoDuration: 90,
    minVideoDuration: 3,
    maxMediaCount: 10,
    maxHashtags: 30,
    recommendedHashtags: 5,
    hashtagRecommendation: ['marka', 'niş', 'kampanya', 'lokasyon'],
    supportsLinks: true,
    clickableLinks: false,
    supportsCarousel: true,
    supportsReels: true,
    supportsStories: true,
    supportsFirstComment: true,
    supportsLocation: true,
    supportsAltText: true,
    restrictions: [
      'Bağlantılar açıklamada tıklanabilir değildir; "profildeki bağlantı" ifadesi önerilir.',
      'İşletme veya creator hesabı gereklidir.',
      'Görseller sRGB renk uzayında olmalıdır.'
    ],
    apiVersion: 'v21.0',
    capabilities: ['MEDIA_PUBLISH', 'CAROUSEL', 'STORY', 'REEL', 'SCHEDULE', 'INSIGHTS']
  },
  {
    platform: 'INSTAGRAM',
    contentType: 'STORY',
    label: 'Instagram Hikayesi',
    maxCaptionLength: 2200,
    recommendedCaptionLength: 90,
    supportedAspectRatios: ['9:16'],
    recommendedAspectRatio: '9:16',
    minWidth: 500,
    minHeight: 888,
    maxWidth: 1440,
    maxHeight: 2560,
    maxFileSize: 8 * MB,
    maxVideoFileSize: 650 * MB,
    supportedMimeTypes: ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'],
    supportedImageFormats: ['jpg', 'jpeg', 'png'],
    supportedVideoFormats: ['mp4', 'mov'],
    maxVideoDuration: 60,
    minVideoDuration: 1,
    maxMediaCount: 1,
    maxHashtags: 10,
    recommendedHashtags: 2,
    supportsLinks: true,
    clickableLinks: true,
    supportsStories: true,
    supportsLocation: true,
    supportsAltText: false,
    safeArea: STORY_SAFE_AREA,
    restrictions: [
      'Üst ve alt arayüz alanlarına logo/metin yerleştirmeyin.',
      'Çıkartma (bağlantı) alanı alt kısımda yer kaplar.'
    ],
    apiVersion: 'v21.0',
    capabilities: ['STORY_PUBLISH', 'LINK_STICKER', 'SCHEDULE']
  },
  {
    platform: 'INSTAGRAM',
    contentType: 'REEL',
    label: 'Instagram Reels',
    maxCaptionLength: 2200,
    recommendedCaptionLength: 140,
    supportedAspectRatios: ['9:16'],
    recommendedAspectRatio: '9:16',
    minWidth: 500,
    minHeight: 888,
    maxWidth: 1440,
    maxHeight: 2560,
    maxFileSize: 8 * MB,
    maxVideoFileSize: 1 * GB,
    supportedMimeTypes: ['video/mp4', 'video/quicktime'],
    supportedVideoFormats: ['mp4', 'mov'],
    maxVideoDuration: 180,
    minVideoDuration: 3,
    maxMediaCount: 1,
    maxHashtags: 30,
    recommendedHashtags: 4,
    supportsLinks: false,
    clickableLinks: false,
    supportsReels: true,
    supportsLocation: true,
    safeArea: STORY_SAFE_AREA,
    restrictions: ['Sağ taraftaki etkileşim butonları alanına metin yerleştirmeyin.'],
    apiVersion: 'v21.0',
    capabilities: ['REEL_PUBLISH', 'COVER', 'SCHEDULE', 'INSIGHTS']
  },

  // ------------------------------- FACEBOOK --------------------------------
  {
    platform: 'FACEBOOK',
    contentType: 'FEED',
    label: 'Facebook Gönderisi',
    maxCaptionLength: 63206,
    recommendedCaptionLength: 300,
    supportedAspectRatios: ['1:1', '4:5', '1.91:1', '16:9'],
    recommendedAspectRatio: '1:1',
    minWidth: 200,
    minHeight: 200,
    maxWidth: 2048,
    maxHeight: 2048,
    maxFileSize: 8 * MB,
    maxVideoFileSize: 1 * GB,
    supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    supportedImageFormats: ['jpg', 'jpeg', 'png', 'webp'],
    supportedVideoFormats: ['mp4', 'mov'],
    maxVideoDuration: 240,
    minVideoDuration: 1,
    maxMediaCount: 10,
    maxHashtags: 30,
    recommendedHashtags: 2,
    supportsLinks: true,
    clickableLinks: true,
    supportsCarousel: true,
    supportsStories: true,
    supportsReels: true,
    supportsLocation: true,
    supportsScheduling: true,
    restrictions: ['Sayfa erişim tokenı (page access token) gereklidir.'],
    apiVersion: 'v21.0',
    capabilities: ['PHOTO_PUBLISH', 'VIDEO_PUBLISH', 'SCHEDULE', 'INSIGHTS']
  },
  {
    platform: 'FACEBOOK',
    contentType: 'STORY',
    label: 'Facebook Hikayesi',
    maxCaptionLength: 500,
    recommendedCaptionLength: 80,
    supportedAspectRatios: ['9:16'],
    recommendedAspectRatio: '9:16',
    minWidth: 600,
    minHeight: 1067,
    maxWidth: 1440,
    maxHeight: 2560,
    maxFileSize: 8 * MB,
    maxVideoFileSize: 650 * MB,
    supportedMimeTypes: ['image/jpeg', 'image/png', 'video/mp4'],
    maxVideoDuration: 20,
    minVideoDuration: 1,
    maxMediaCount: 1,
    maxHashtags: 0,
    supportsLinks: true,
    clickableLinks: true,
    safeArea: STORY_SAFE_AREA,
    apiVersion: 'v21.0',
    capabilities: ['STORY_PUBLISH']
  },
  {
    platform: 'FACEBOOK',
    contentType: 'REEL',
    label: 'Facebook Reels',
    maxCaptionLength: 3000,
    recommendedCaptionLength: 140,
    supportedAspectRatios: ['9:16'],
    recommendedAspectRatio: '9:16',
    minWidth: 500,
    minHeight: 888,
    maxWidth: 1440,
    maxHeight: 2560,
    maxFileSize: 8 * MB,
    maxVideoFileSize: 1 * GB,
    supportedMimeTypes: ['video/mp4'],
    maxVideoDuration: 90,
    minVideoDuration: 3,
    maxMediaCount: 1,
    maxHashtags: 10,
    recommendedHashtags: 3,
    safeArea: STORY_SAFE_AREA,
    apiVersion: 'v21.0',
    capabilities: ['REEL_PUBLISH', 'SCHEDULE']
  },

  // ----------------------------------- X -----------------------------------
  {
    platform: 'X',
    contentType: 'POST',
    label: 'X Gönderisi',
    maxCaptionLength: 280,
    recommendedCaptionLength: 200,
    supportedAspectRatios: ['1:1', '16:9', '4:5', '3:2'],
    recommendedAspectRatio: '16:9',
    minWidth: 300,
    minHeight: 300,
    maxWidth: 4096,
    maxHeight: 4096,
    maxFileSize: 5 * MB,
    maxVideoFileSize: 512 * MB,
    supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'],
    supportedImageFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    supportedVideoFormats: ['mp4'],
    maxVideoDuration: 140,
    minVideoDuration: 1,
    maxMediaCount: 4,
    maxHashtags: 10,
    recommendedHashtags: 2,
    supportsLinks: true,
    clickableLinks: true,
    supportsMentions: true,
    supportsThreads: true,
    supportsScheduling: true,
    restrictions: [
      'Bağlantılar 23 karakter olarak sayılır (t.co kısaltması).',
      'Premium abonelik olmadan 280 karakter sınırı geçerlidir.',
      'Görseller 5 MB, videolar 512 MB sınırına tabidir.'
    ],
    apiVersion: 'v2',
    capabilities: ['TWEET_CREATE', 'MEDIA_UPLOAD', 'THREAD', 'SCHEDULE']
  },

  // -------------------------------- LINKEDIN -------------------------------
  {
    platform: 'LINKEDIN',
    contentType: 'POST',
    label: 'LinkedIn Şirket Sayfası Gönderisi',
    maxCaptionLength: 3000,
    recommendedCaptionLength: 350,
    supportedAspectRatios: ['1:1', '1.91:1', '4:5', '16:9'],
    recommendedAspectRatio: '1:1',
    minWidth: 512,
    minHeight: 512,
    maxWidth: 4096,
    maxHeight: 4096,
    maxFileSize: 8 * MB,
    maxVideoFileSize: 200 * MB,
    supportedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
    supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif'],
    supportedVideoFormats: ['mp4'],
    maxVideoDuration: 600,
    minVideoDuration: 3,
    maxMediaCount: 20,
    maxHashtags: 20,
    recommendedHashtags: 3,
    supportsLinks: true,
    clickableLinks: true,
    supportsCarousel: true,
    supportsScheduling: true,
    supportsAltText: true,
    restrictions: [
      'Şirket sayfası için "w_member_social" ve organizasyon yönetici yetkisi gerekir.',
      'Metin içindeki ilk 210 karakterden sonrası "...daha fazla" ile gizlenir.'
    ],
    apiVersion: '202409',
    capabilities: ['SHARE_CREATE', 'IMAGE_UPLOAD', 'VIDEO_UPLOAD', 'SCHEDULE']
  },
  {
    platform: 'LINKEDIN',
    contentType: 'PROFILE_POST',
    label: 'LinkedIn Kişisel Profil Gönderisi',
    maxCaptionLength: 3000,
    recommendedCaptionLength: 350,
    supportedAspectRatios: ['1:1', '1.91:1', '4:5', '16:9'],
    recommendedAspectRatio: '1:1',
    minWidth: 512,
    minHeight: 512,
    maxWidth: 4096,
    maxHeight: 4096,
    maxFileSize: 8 * MB,
    maxVideoFileSize: 200 * MB,
    supportedMimeTypes: ['image/jpeg', 'image/png', 'video/mp4'],
    maxMediaCount: 20,
    maxHashtags: 20,
    recommendedHashtags: 3,
    supportsLinks: true,
    clickableLinks: true,
    supportsScheduling: true,
    restrictions: ['Kişisel profil gönderisi için ayrı bir kullanıcı OAuth yetkilendirmesi gerekir.'],
    apiVersion: '202409',
    capabilities: ['SHARE_CREATE', 'SCHEDULE']
  },

  // --------------------------------- TIKTOK --------------------------------
  {
    platform: 'TIKTOK',
    contentType: 'VIDEO',
    label: 'TikTok Videosu',
    maxCaptionLength: 2200,
    recommendedCaptionLength: 120,
    supportedAspectRatios: ['9:16', '1:1', '16:9'],
    recommendedAspectRatio: '9:16',
    minWidth: 540,
    minHeight: 960,
    maxWidth: 2160,
    maxHeight: 3840,
    maxFileSize: 4 * GB,
    maxVideoFileSize: 4 * GB,
    supportedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    supportedVideoFormats: ['mp4', 'webm', 'mov'],
    maxVideoDuration: 600,
    minVideoDuration: 3,
    maxMediaCount: 1,
    maxHashtags: 30,
    recommendedHashtags: 4,
    supportsLinks: false,
    clickableLinks: false,
    supportsScheduling: true,
    safeArea: STORY_SAFE_AREA,
    restrictions: [
      'Content Posting API için uygulama denetimi (audit) gerekir.',
      'Doğrudan yayınlama (DIRECT_POST) izni onaya tabidir; aksi halde video taslak olarak kullanıcının cihazına gönderilir.'
    ],
    apiVersion: 'v2',
    capabilities: ['VIDEO_PUBLISH', 'DIRECT_POST', 'SCHEDULE']
  },

  // -------------------------------- YOUTUBE --------------------------------
  {
    platform: 'YOUTUBE',
    contentType: 'VIDEO',
    label: 'YouTube Videosu',
    maxCaptionLength: 5000,
    recommendedCaptionLength: 500,
    supportedAspectRatios: ['16:9', '1:1', '4:3'],
    recommendedAspectRatio: '16:9',
    minWidth: 1280,
    minHeight: 720,
    maxWidth: 7680,
    maxHeight: 4320,
    maxFileSize: 256 * GB,
    maxVideoFileSize: 256 * GB,
    supportedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
    supportedVideoFormats: ['mp4', 'webm', 'mov', 'avi'],
    maxVideoDuration: 43200,
    minVideoDuration: 1,
    maxMediaCount: 1,
    maxHashtags: 15,
    recommendedHashtags: 3,
    supportsLinks: true,
    clickableLinks: true,
    supportsScheduling: true,
    restrictions: [
      'Açıklamanın ilk 100 karakteri video altında görünür.',
      'Doğrulanmamış API projelerinde günlük yükleme kotası sınırlıdır.',
      "15 dakikadan uzun videolar için hesabın doğrulanmış olması gerekir."
    ],
    apiVersion: 'v3',
    capabilities: ['VIDEO_UPLOAD', 'RESUMABLE_UPLOAD', 'SCHEDULE', 'ANALYTICS']
  },
  {
    platform: 'YOUTUBE',
    contentType: 'SHORTS',
    label: 'YouTube Shorts',
    maxCaptionLength: 100,
    recommendedCaptionLength: 70,
    supportedAspectRatios: ['9:16', '1:1'],
    recommendedAspectRatio: '9:16',
    minWidth: 720,
    minHeight: 1280,
    maxWidth: 2160,
    maxHeight: 3840,
    maxFileSize: 256 * GB,
    maxVideoFileSize: 256 * GB,
    supportedMimeTypes: ['video/mp4', 'video/webm'],
    maxVideoDuration: 180,
    minVideoDuration: 1,
    maxMediaCount: 1,
    maxHashtags: 15,
    recommendedHashtags: 3,
    supportsLinks: false,
    clickableLinks: false,
    supportsScheduling: true,
    safeArea: { top: 0.12, bottom: 0.18, left: 0.05, right: 0.12 },
    restrictions: [
      'Shorts olarak sınıflandırılması için dikey oran ve ≤3 dakika süre gerekir.',
      'Başlık 100 karakterle sınırlıdır.'
    ],
    apiVersion: 'v3',
    capabilities: ['SHORTS_UPLOAD', 'SCHEDULE']
  },

  // -------------------------------- THREADS --------------------------------
  {
    platform: 'THREADS',
    contentType: 'POST',
    label: 'Threads Gönderisi',
    maxCaptionLength: 500,
    recommendedCaptionLength: 300,
    supportedAspectRatios: ['1:1', '4:5', '16:9', '9:16'],
    recommendedAspectRatio: '1:1',
    minWidth: 320,
    minHeight: 320,
    maxWidth: 1440,
    maxHeight: 2560,
    maxFileSize: 8 * MB,
    maxVideoFileSize: 650 * MB,
    supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    maxVideoDuration: 60,
    minVideoDuration: 1,
    maxMediaCount: 10,
    maxHashtags: 5,
    recommendedHashtags: 1,
    supportsLinks: true,
    clickableLinks: true,
    supportsMentions: true,
    supportsCarousel: true,
    supportsThreads: true,
    supportsScheduling: false,
    restrictions: [
      'Threads API yalnızca son 7 gün içinde etkin olan hesaplarla çalışır.',
      'Yerleşik zamanlama desteği sınırlıdır; uygulama tarafında kuyruk kullanılır.'
    ],
    apiVersion: 'v21.0',
    capabilities: ['TEXT_POST', 'MEDIA_POST', 'CAROUSEL', 'REPLY']
  },

  // ------------------------------- PINTEREST -------------------------------
  {
    platform: 'PINTEREST',
    contentType: 'PIN',
    label: 'Pinterest Pin',
    maxCaptionLength: 100,
    recommendedCaptionLength: 70,
    supportedAspectRatios: ['2:3', '1:1', '9:16', '4:5'],
    recommendedAspectRatio: '2:3',
    minWidth: 600,
    minHeight: 900,
    maxWidth: 2368,
    maxHeight: 3548,
    maxFileSize: 20 * MB,
    maxVideoFileSize: 100 * MB,
    supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    supportedImageFormats: ['jpg', 'jpeg', 'png', 'webp'],
    supportedVideoFormats: ['mp4', 'mov'],
    maxVideoDuration: 900,
    minVideoDuration: 4,
    maxMediaCount: 1,
    maxHashtags: 20,
    recommendedHashtags: 2,
    supportsLinks: true,
    clickableLinks: true,
    supportsScheduling: true,
    supportsAltText: true,
    restrictions: ['Pin açıklaması 100 karakterden sonra kırpılır.', 'Bağlantı zorunlu değildir ama önerilir.'],
    apiVersion: 'v5',
    capabilities: ['PIN_CREATE', 'MEDIA_UPLOAD', 'SCHEDULE']
  },

  // --------------------------- GOOGLE BUSINESS -----------------------------
  {
    platform: 'GOOGLE_BUSINESS',
    contentType: 'LOCAL_POST',
    label: 'Google İşletme Gönderisi',
    maxCaptionLength: 1500,
    recommendedCaptionLength: 350,
    supportedAspectRatios: ['4:3', '1:1'],
    recommendedAspectRatio: '4:3',
    minWidth: 480,
    minHeight: 270,
    maxWidth: 2160,
    maxHeight: 2160,
    maxFileSize: 10 * MB,
    supportedMimeTypes: ['image/jpeg', 'image/png'],
    supportedImageFormats: ['jpg', 'jpeg', 'png'],
    maxMediaCount: 1,
    maxHashtags: 0,
    recommendedHashtags: 0,
    supportsLinks: true,
    clickableLinks: true,
    supportsScheduling: true,
    restrictions: [
      'Gönderiler varsayılan olarak 7 gün sonra yayından kalkar.',
      'Etkinlik (event) türü gönderilerde başlangıç/bitiş tarihi zorunludur.'
    ],
    apiVersion: 'v1',
    capabilities: ['LOCAL_POST_CREATE', 'CTA_BUTTON', 'SCHEDULE']
  }
];

export const BUILTIN_RULE_MAP = new Map<string, BuiltinRule>(
  BUILTIN_RULES.map((r) => [`${r.platform}:${r.contentType}`, r])
);
