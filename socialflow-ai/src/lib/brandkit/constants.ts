/**
 * PHASE 4 — Brand Kit merkezi sabitleri
 * ---------------------------------------------------------------------------
 * Kod anahtarları İngilizce (iç geliştirme), kullanıcıya görünen etiketler
 * Türkçe. Bu dosya Brand Kit'in TEK doğruluk kaynağıdır; UI, API ve servisler
 * buradaki sabitleri kullanır (hard-code etiket/enum YOK).
 *
 * Mevcut sistemleri TAMAMLAR, değiştirmez:
 *  - "Marka Dili" sekmesi mevcut BrandVoice modelini kullanır.
 *  - "Ürün Kuralları" sekmesi ürün kataloğuna (Product/ClaimRule) bağlanır.
 *  - "Şablonlar" sekmesi mevcut şablon sistemine bağlanır.
 */

// --- Onay durumu deseni (§44) ---
export const APPROVAL_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ARCHIVED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  DRAFT: 'Taslak',
  PENDING_APPROVAL: 'Onay Bekliyor',
  APPROVED: 'Onaylandı',
  ARCHIVED: 'Arşivlendi'
};

// --- Marka Kilidi (§41) ---
export const LOCK_MODES = ['OFF', 'STANDARD', 'STRICT'] as const;
export type LockMode = (typeof LOCK_MODES)[number];

export const LOCK_MODE_LABELS: Record<LockMode, string> = {
  OFF: 'Kapalı',
  STANDARD: 'Standart',
  STRICT: 'Katı'
};

export const LOCK_MODE_DESCRIPTIONS: Record<LockMode, string> = {
  OFF: 'Kilit yok. Tüm alanlar düzenlenebilir.',
  STANDARD: 'Temel kimlik alanları (logo, renk, yasal) kilitli; diğerleri düzenlenebilir.',
  STRICT: 'Yalnızca yetkili roller düzenleyebilir; AI ve otomasyon marka kitini değiştiremez.'
};

// --- Yayın öncesi marka tutarlılık kapısı (§55) ---
export const CONSISTENCY_GATES = ['OFF', 'WARNING', 'REQUIRE_APPROVAL', 'BLOCK'] as const;
export type ConsistencyGate = (typeof CONSISTENCY_GATES)[number];

export const CONSISTENCY_GATE_LABELS: Record<ConsistencyGate, string> = {
  OFF: 'Kapalı',
  WARNING: 'Uyarı',
  REQUIRE_APPROVAL: 'Onay Gerektir',
  BLOCK: 'Engelle'
};

// --- Logo kullanım tipleri (§7) ---
export const LOGO_USAGE_TYPES = [
  'PRIMARY', 'HORIZONTAL', 'VERTICAL', 'ICON', 'LIGHT_BG', 'DARK_BG',
  'MONOCHROME', 'WATERMARK', 'FAVICON', 'APP_ICON'
] as const;
export type LogoUsageType = (typeof LOGO_USAGE_TYPES)[number];

export const LOGO_USAGE_LABELS: Record<LogoUsageType, string> = {
  PRIMARY: 'Birincil Logo',
  HORIZONTAL: 'Yatay Logo',
  VERTICAL: 'Dikey Logo',
  ICON: 'İkon / Amblem',
  LIGHT_BG: 'Açık Zemin',
  DARK_BG: 'Koyu Zemin',
  MONOCHROME: 'Tek Renk',
  WATERMARK: 'Filigran',
  FAVICON: 'Favicon',
  APP_ICON: 'Uygulama İkonu'
};

// --- Renk kategorileri (§11-§14) ---
export const COLOR_CATEGORIES = [
  'PRIMARY', 'SECONDARY', 'ACCENT', 'BACKGROUND', 'TEXT', 'NEUTRAL', 'SUPPORT', 'CAMPAIGN'
] as const;
export type ColorCategory = (typeof COLOR_CATEGORIES)[number];

export const COLOR_CATEGORY_LABELS: Record<ColorCategory, string> = {
  PRIMARY: 'Birincil',
  SECONDARY: 'İkincil',
  ACCENT: 'Vurgu',
  BACKGROUND: 'Arka Plan',
  TEXT: 'Metin',
  NEUTRAL: 'Nötr',
  SUPPORT: 'Destekleyici',
  CAMPAIGN: 'Kampanya'
};

// --- Tipografi rolleri (§16) ---
export const TYPOGRAPHY_ROLES = ['HEADING', 'SUBHEADING', 'BODY', 'CTA', 'ACCENT'] as const;
export type TypographyRole = (typeof TYPOGRAPHY_ROLES)[number];

export const TYPOGRAPHY_ROLE_LABELS: Record<TypographyRole, string> = {
  HEADING: 'Başlık',
  SUBHEADING: 'Alt Başlık',
  BODY: 'Gövde',
  CTA: 'CTA / Buton',
  ACCENT: 'Vurgu'
};

// --- Mesaj / slogan tipleri (§23) ---
export const MESSAGE_TYPES = [
  'MAIN_SLOGAN', 'SUB_SLOGAN', 'CAMPAIGN_SLOGAN', 'PRODUCT_SLOGAN',
  'SHORT_MESSAGE', 'BRAND_PROMISE', 'USP', 'VALUE_PROPOSITION'
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  MAIN_SLOGAN: 'Ana Slogan',
  SUB_SLOGAN: 'Alt Slogan',
  CAMPAIGN_SLOGAN: 'Kampanya Sloganı',
  PRODUCT_SLOGAN: 'Ürün Sloganı',
  SHORT_MESSAGE: 'Kısa Mesaj',
  BRAND_PROMISE: 'Marka Vaadi',
  USP: 'Özgün Değer Önerisi (USP)',
  VALUE_PROPOSITION: 'Değer Önermesi'
};

// --- CTA kategorileri (§25) ---
export const CTA_CATEGORIES = ['PREFERRED', 'FORBIDDEN', 'CAMPAIGN'] as const;
export type CtaCategory = (typeof CTA_CATEGORIES)[number];

export const CTA_CATEGORY_LABELS: Record<CtaCategory, string> = {
  PREFERRED: 'Tercih Edilen',
  FORBIDDEN: 'Yasaklı',
  CAMPAIGN: 'Kampanya'
};

// --- Hashtag kategorileri (§27) ---
export const HASHTAG_CATEGORIES = [
  'DEFAULT', 'REQUIRED', 'CAMPAIGN', 'PRODUCT', 'LOCATION', 'COMMUNITY', 'BANNED'
] as const;
export type HashtagCategory = (typeof HASHTAG_CATEGORIES)[number];

export const HASHTAG_CATEGORY_LABELS: Record<HashtagCategory, string> = {
  DEFAULT: 'Varsayılan',
  REQUIRED: 'Zorunlu',
  CAMPAIGN: 'Kampanya',
  PRODUCT: 'Ürün',
  LOCATION: 'Konum',
  COMMUNITY: 'Topluluk',
  BANNED: 'Yasaklı'
};

// --- Mention tipleri (§28) ---
export const MENTION_TYPES = [
  'OFFICIAL', 'PARTNER', 'FOUNDER', 'CAMPAIGN_PARTNER', 'LOCATION', 'OTHER'
] as const;
export type MentionType = (typeof MENTION_TYPES)[number];

export const MENTION_TYPE_LABELS: Record<MentionType, string> = {
  OFFICIAL: 'Resmi Hesap',
  PARTNER: 'Partner',
  FOUNDER: 'Kurucu',
  CAMPAIGN_PARTNER: 'Kampanya Partneri',
  LOCATION: 'Konum',
  OTHER: 'Diğer'
};

// --- Görsel stil kural kategorileri (§29-§33) ---
export const VISUAL_RULE_CATEGORIES = [
  'PHOTOGRAPHY', 'LIGHTING', 'BACKGROUND', 'COMPOSITION', 'DEPTH', 'COLOR_GRADING',
  'PRODUCT_PLACEMENT', 'HUMAN_PRESENCE', 'MODEL', 'LIFESTYLE', 'TEXTURE', 'MOOD',
  'ICON_STYLE', 'SHAPE_STYLE', 'PRODUCT_VISUAL'
] as const;
export type VisualRuleCategory = (typeof VISUAL_RULE_CATEGORIES)[number];

export const VISUAL_RULE_CATEGORY_LABELS: Record<VisualRuleCategory, string> = {
  PHOTOGRAPHY: 'Fotoğraf Stili',
  LIGHTING: 'Işık',
  BACKGROUND: 'Arka Plan',
  COMPOSITION: 'Kompozisyon',
  DEPTH: 'Derinlik',
  COLOR_GRADING: 'Renk Düzenleme',
  PRODUCT_PLACEMENT: 'Ürün Yerleşimi',
  HUMAN_PRESENCE: 'İnsan Kullanımı',
  MODEL: 'Model',
  LIFESTYLE: 'Yaşam Tarzı',
  TEXTURE: 'Doku',
  MOOD: 'Ruh Hali',
  ICON_STYLE: 'İkon Stili',
  SHAPE_STYLE: 'Şekil Stili',
  PRODUCT_VISUAL: 'Ürün Görseli'
};

// --- Yasal / kampanya kural kategorileri (§35-§36) ---
export const LEGAL_RULE_CATEGORIES = ['LEGAL_INFO', 'CAMPAIGN_RULE'] as const;
export type LegalRuleCategory = (typeof LEGAL_RULE_CATEGORIES)[number];

export const LEGAL_RULE_CATEGORY_LABELS: Record<LegalRuleCategory, string> = {
  LEGAL_INFO: 'Yasal Bilgiler',
  CAMPAIGN_RULE: 'Kampanya Kuralları'
};

// Sık kullanılan yasal/kampanya kural anahtarları (serbest anahtar da geçerli).
export const LEGAL_RULE_KEYS = [
  'PRICE_FORMAT', 'DISCOUNT_FORMAT', 'DATE_FORMAT', 'COUPON_FORMAT',
  'MANDATORY_DISCLAIMER', 'REQUIRED_LEGAL_LINE', 'REGISTERED_NAME', 'LEGAL_NOTICE',
  'KVKK_URL', 'PRIVACY_URL', 'TERMS_URL', 'RETURN_POLICY_URL', 'PROMOTION_RULE'
] as const;

export const LEGAL_RULE_KEY_LABELS: Record<string, string> = {
  PRICE_FORMAT: 'Fiyat Biçimi',
  DISCOUNT_FORMAT: 'İndirim Biçimi',
  DATE_FORMAT: 'Tarih Biçimi',
  COUPON_FORMAT: 'Kupon Biçimi',
  MANDATORY_DISCLAIMER: 'Zorunlu Sorumluluk Reddi',
  REQUIRED_LEGAL_LINE: 'Zorunlu Yasal Satır',
  REGISTERED_NAME: 'Tescilli Ünvan',
  LEGAL_NOTICE: 'Yasal Uyarı',
  KVKK_URL: 'KVKK Metni URL',
  PRIVACY_URL: 'Gizlilik Politikası URL',
  TERMS_URL: 'Kullanım Koşulları URL',
  RETURN_POLICY_URL: 'İade Politikası URL',
  PROMOTION_RULE: 'Promosyon Kuralı'
};

// --- Marka dosyası / varlık tipleri (§37) ---
export const ASSET_TYPES = [
  'LOGO', 'PRODUCT_IMAGE', 'FOUNDER_IMAGE', 'STORE_IMAGE', 'OFFICE_IMAGE', 'BACKGROUND',
  'ICON', 'ILLUSTRATION', 'CAMPAIGN_IMAGE', 'VIDEO_INTRO', 'VIDEO_OUTRO', 'JINGLE',
  'AUDIO', 'PDF_GUIDELINE', 'OTHER'
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  LOGO: 'Logo',
  PRODUCT_IMAGE: 'Ürün Görseli',
  FOUNDER_IMAGE: 'Kurucu Görseli',
  STORE_IMAGE: 'Mağaza Görseli',
  OFFICE_IMAGE: 'Ofis Görseli',
  BACKGROUND: 'Arka Plan',
  ICON: 'İkon',
  ILLUSTRATION: 'İllüstrasyon',
  CAMPAIGN_IMAGE: 'Kampanya Görseli',
  VIDEO_INTRO: 'Video Giriş',
  VIDEO_OUTRO: 'Video Kapanış',
  JINGLE: 'Cingıl',
  AUDIO: 'Ses',
  PDF_GUIDELINE: 'PDF Rehber',
  OTHER: 'Diğer'
};

// --- Referans türleri (§52) ---
export const REFERENCE_KINDS = ['LIKED', 'AVOID'] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const REFERENCE_KIND_LABELS: Record<ReferenceKind, string> = {
  LIKED: 'Beğendiğimiz Tasarımlar',
  AVOID: 'Kaçınılacak Tasarımlar'
};

// --- Marka hafızası (§50-§51) ---
export const MEMORY_KINDS = ['STYLE_INSIGHT', 'APPROVED_PATTERN', 'PREFERENCE'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  STYLE_INSIGHT: 'Stil İçgörüsü',
  APPROVED_PATTERN: 'Onaylı Kalıp',
  PREFERENCE: 'Tercih'
};

export const MEMORY_SOURCES = [
  'BRAND_KIT', 'APPROVED_CONTENT', 'APPROVED_CAMPAIGN', 'APPROVED_CREATIVE', 'TEMPLATE'
] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

// ---------------------------------------------------------------------------
//  Brand Kit 18 sekme kaydı (§ Brand Kit tabs)
//  `backing` alanı sekmenin hangi model/sisteme dayandığını belirtir; mevcut
//  sistemler (BrandVoice, Product, Template) YENİDEN kullanılır.
// ---------------------------------------------------------------------------
export interface BrandKitTab {
  id: string;
  label: string;
  backing:
    | 'brandKit' | 'logo' | 'color' | 'typography' | 'brandVoice' | 'message'
    | 'cta' | 'hashtagMention' | 'visualRule' | 'platformRule' | 'product'
    | 'campaignRule' | 'template' | 'asset' | 'legal' | 'aiRule' | 'memory' | 'version';
  description?: string;
}

export const BRAND_KIT_TABS: BrandKitTab[] = [
  { id: 'genel', label: 'Genel Bilgiler', backing: 'brandKit', description: 'Marka kimliği, sektör, iletişim ve hedef pazar.' },
  { id: 'logo', label: 'Logo', backing: 'logo', description: 'Logo varyantları ve kullanım kuralları.' },
  { id: 'renkler', label: 'Renkler', backing: 'color', description: 'Renk paleti, Pantone/CMYK ve yasaklı renkler.' },
  { id: 'tipografi', label: 'Tipografi', backing: 'typography', description: 'Font rolleri ve lisans bilgileri.' },
  { id: 'marka-dili', label: 'Marka Dili', backing: 'brandVoice', description: 'Ton, biçimsellik, emoji ve terim kuralları.' },
  { id: 'slogan', label: 'Slogan ve Mesajlar', backing: 'message', description: 'Sloganlar, marka vaadi ve değer önermesi.' },
  { id: 'cta', label: 'CTA', backing: 'cta', description: 'Tercih edilen ve yasaklı harekete geçirici mesajlar.' },
  { id: 'hashtag-mention', label: 'Hashtag ve Mention', backing: 'hashtagMention', description: 'Zorunlu/varsayılan/yasaklı etiketler ve bahsetmeler.' },
  { id: 'gorsel-stil', label: 'Görsel Stil', backing: 'visualRule', description: 'Fotoğraf, ışık, kompozisyon ve ruh hali kuralları.' },
  { id: 'sosyal-kurallar', label: 'Sosyal Medya Kuralları', backing: 'platformRule', description: 'Platform bazlı ton, CTA ve emoji yönergeleri.' },
  { id: 'urun-kurallari', label: 'Ürün Kuralları', backing: 'product', description: 'Ürün kataloğu ve doğrulanmış iddia kuralları.' },
  { id: 'kampanya-kurallari', label: 'Kampanya Kuralları', backing: 'campaignRule', description: 'Fiyat/indirim/tarih/kupon biçim kuralları.' },
  { id: 'sablonlar', label: 'Şablonlar', backing: 'template', description: 'Marka şablonları ve kreatif ön ayarları.' },
  { id: 'dosyalar', label: 'Marka Dosyaları', backing: 'asset', description: 'Logo, görsel, ses ve rehber dosyaları.' },
  { id: 'yasal', label: 'Yasal', backing: 'legal', description: 'Yasal bilgiler, zorunlu satırlar ve politika bağlantıları.' },
  { id: 'ai-kurallari', label: 'AI Kuralları', backing: 'aiRule', description: 'AI özerklik seviyesi ve marka kiti AI yönergeleri.' },
  { id: 'marka-hafizasi', label: 'Marka Hafızası', backing: 'memory', description: 'Onaylı içerikten öğrenilen tercihler.' },
  { id: 'surum-gecmisi', label: 'Sürüm Geçmişi', backing: 'version', description: 'Marka kiti sürümleri ve anlık görüntüleri.' }
];

export const BRAND_KIT_TAB_BY_ID = Object.fromEntries(
  BRAND_KIT_TABS.map((t) => [t.id, t])
) as Record<string, BrandKitTab>;
