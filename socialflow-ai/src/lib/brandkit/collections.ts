import {
  APPROVAL_STATUSES, APPROVAL_STATUS_LABELS,
  LOGO_USAGE_TYPES, LOGO_USAGE_LABELS,
  COLOR_CATEGORIES, COLOR_CATEGORY_LABELS,
  TYPOGRAPHY_ROLES, TYPOGRAPHY_ROLE_LABELS,
  MESSAGE_TYPES, MESSAGE_TYPE_LABELS,
  CTA_CATEGORIES, CTA_CATEGORY_LABELS,
  HASHTAG_CATEGORIES, HASHTAG_CATEGORY_LABELS,
  MENTION_TYPES, MENTION_TYPE_LABELS,
  VISUAL_RULE_CATEGORIES, VISUAL_RULE_CATEGORY_LABELS,
  LEGAL_RULE_CATEGORIES, LEGAL_RULE_CATEGORY_LABELS,
  ASSET_TYPES, ASSET_TYPE_LABELS,
  REFERENCE_KINDS, REFERENCE_KIND_LABELS,
  MEMORY_KINDS, MEMORY_KIND_LABELS,
  MEMORY_SOURCES
} from './constants';
import type { BrandKitPermission } from './permissions';

/**
 * PHASE 4 — Brand Kit koleksiyon kayıt defteri (config-driven CRUD)
 * ---------------------------------------------------------------------------
 * 13 alt koleksiyonun (logo, renk, tipografi, ...) alan şemalarını TEK yerde
 * tanımlar. API route'ları ve UI bu kayıttan beslenir; böylece her sekme için
 * ayrı route/component yazmak yerine genel bir mekanizma tümünü dikey olarak
 * çalıştırır. Yeni alan eklemek = yalnızca buraya bir satır eklemek.
 */

export const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', X: 'X (Twitter)', LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok', YOUTUBE: 'YouTube', THREADS: 'Threads', PINTEREST: 'Pinterest',
  GOOGLE_BUSINESS: 'Google Business'
};

export type FieldType = 'string' | 'text' | 'int' | 'boolean' | 'color' | 'select' | 'tags';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
}

export interface CollectionDef {
  key: string;
  delegate: string; // prisma istemci erişim anahtarı (ör. 'brandColor')
  label: string; // tekil, Türkçe
  labelPlural: string;
  icon: string;
  perm: BrandKitPermission;
  /** Marka kilidi STANDARD modunda bu koleksiyon yalnızca ADMIN+ tarafından düzenlenir. */
  lockSensitive?: boolean;
  hasOrder?: boolean;
  fields: FieldDef[];
}

const approval = (def: Partial<FieldDef> = {}): FieldDef => ({
  name: 'approvalStatus',
  label: 'Onay Durumu',
  type: 'select',
  default: 'DRAFT',
  options: APPROVAL_STATUSES.map((v) => ({ value: v, label: APPROVAL_STATUS_LABELS[v] })),
  ...def
});

const order = (): FieldDef => ({ name: 'order', label: 'Sıra', type: 'int', default: 0 });

function opts<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((v) => ({ value: v as string, label: labels[v] }));
}

const platformOptions = [
  { value: '', label: 'Genel (tüm platformlar)' },
  ...Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label }))
];

export const COLLECTIONS: Record<string, CollectionDef> = {
  logos: {
    key: 'logos', delegate: 'brandLogo', label: 'Logo', labelPlural: 'Logolar', icon: 'image',
    perm: 'edit', lockSensitive: true, hasOrder: true,
    fields: [
      { name: 'usageType', label: 'Kullanım Tipi', type: 'select', default: 'PRIMARY', options: opts(LOGO_USAGE_TYPES, LOGO_USAGE_LABELS) },
      { name: 'name', label: 'Ad', type: 'string', placeholder: 'Birincil Logo' },
      { name: 'fileUrl', label: 'Dosya URL', type: 'string', placeholder: '/storage/... veya https://...' },
      { name: 'format', label: 'Format', type: 'string', placeholder: 'png, svg...' },
      { name: 'width', label: 'Genişlik (px)', type: 'int' },
      { name: 'height', label: 'Yükseklik (px)', type: 'int' },
      { name: 'transparentBg', label: 'Şeffaf Zemin', type: 'boolean', default: false },
      { name: 'isPrimary', label: 'Birincil Logo', type: 'boolean', default: false },
      { name: 'minWidth', label: 'Min. Genişlik (px)', type: 'int' },
      { name: 'minHeight', label: 'Min. Yükseklik (px)', type: 'int' },
      { name: 'minSafeSpace', label: 'Min. Güvenli Boşluk', type: 'string', placeholder: '1x' },
      { name: 'maxRotation', label: 'Maks. Döndürme (°)', type: 'int', default: 0 },
      { name: 'allowedBackgrounds', label: 'İzin Verilen Zeminler', type: 'tags', placeholder: 'beyaz, açık gri' },
      { name: 'disallowedBackgrounds', label: 'Yasak Zeminler', type: 'tags', placeholder: 'kırmızı, desenli' },
      { name: 'misuseRules', label: 'Kötüye Kullanım Kuralları', type: 'tags', placeholder: 'döndürme, gölge ekleme' },
      approval(), order()
    ]
  },
  colors: {
    key: 'colors', delegate: 'brandColor', label: 'Renk', labelPlural: 'Renkler', icon: 'palette',
    perm: 'edit', lockSensitive: true, hasOrder: true,
    fields: [
      { name: 'name', label: 'Renk Adı', type: 'string', required: true, placeholder: 'Birincil Renk' },
      { name: 'hex', label: 'HEX', type: 'color', required: true, placeholder: '#7C4DFF' },
      { name: 'rgb', label: 'RGB', type: 'string', placeholder: '124,77,255' },
      { name: 'cmyk', label: 'CMYK', type: 'string', placeholder: '51,70,0,0' },
      { name: 'pantone', label: 'Pantone', type: 'string', placeholder: '2725 C' },
      { name: 'category', label: 'Kategori', type: 'select', default: 'PRIMARY', options: opts(COLOR_CATEGORIES, COLOR_CATEGORY_LABELS) },
      { name: 'usage', label: 'Kullanım', type: 'string', placeholder: 'Başlıklar ve CTA' },
      { name: 'priority', label: 'Öncelik', type: 'int', default: 0 },
      { name: 'prohibited', label: 'Yasaklı Renk', type: 'boolean', default: false, hint: 'İşaretlenirse AI bu rengi kullanmaz.' },
      approval(), order()
    ]
  },
  typography: {
    key: 'typography', delegate: 'brandTypography', label: 'Tipografi', labelPlural: 'Tipografi', icon: 'text',
    perm: 'edit', hasOrder: true,
    fields: [
      { name: 'role', label: 'Rol', type: 'select', default: 'BODY', options: opts(TYPOGRAPHY_ROLES, TYPOGRAPHY_ROLE_LABELS) },
      { name: 'fontFamily', label: 'Font Ailesi', type: 'string', required: true, placeholder: 'Inter, Poppins...' },
      { name: 'fontWeight', label: 'Kalınlık', type: 'string', placeholder: '400, 700, Bold' },
      { name: 'fontSizeRec', label: 'Punto Önerisi', type: 'string', placeholder: '16-18px' },
      { name: 'lineHeight', label: 'Satır Yüksekliği', type: 'string', placeholder: '1.5' },
      { name: 'letterSpacing', label: 'Harf Aralığı', type: 'string', placeholder: '0.2px' },
      { name: 'textCase', label: 'Harf Durumu', type: 'select', options: [
        { value: '', label: 'Belirtilmemiş' }, { value: 'none', label: 'normal' },
        { value: 'uppercase', label: 'BÜYÜK' }, { value: 'lowercase', label: 'küçük' },
        { value: 'capitalize', label: 'Baş Harf Büyük' }
      ] },
      { name: 'usage', label: 'Kullanım', type: 'string' },
      { name: 'licenseName', label: 'Lisans Adı', type: 'string' },
      { name: 'licenseProvider', label: 'Lisans Sağlayıcı', type: 'string' },
      { name: 'licenseNote', label: 'Lisans Notu', type: 'text' },
      approval(), order()
    ]
  },
  messages: {
    key: 'messages', delegate: 'brandMessage', label: 'Mesaj', labelPlural: 'Slogan ve Mesajlar', icon: 'sparkles',
    perm: 'edit', hasOrder: true,
    fields: [
      { name: 'type', label: 'Tip', type: 'select', default: 'MAIN_SLOGAN', options: opts(MESSAGE_TYPES, MESSAGE_TYPE_LABELS) },
      { name: 'text', label: 'Metin', type: 'text', required: true, placeholder: 'Her fincanda bir hikâye' },
      { name: 'language', label: 'Dil', type: 'string', default: 'tr' },
      { name: 'isPrimary', label: 'Birincil', type: 'boolean', default: false },
      approval(), order()
    ]
  },
  ctas: {
    key: 'ctas', delegate: 'brandCTA', label: 'CTA', labelPlural: 'CTA', icon: 'target',
    perm: 'edit', hasOrder: true,
    fields: [
      { name: 'text', label: 'CTA Metni', type: 'string', required: true, placeholder: 'Hemen Keşfet' },
      { name: 'platform', label: 'Platform', type: 'select', options: platformOptions, hint: 'Boş = genel' },
      { name: 'category', label: 'Kategori', type: 'select', default: 'PREFERRED', options: opts(CTA_CATEGORIES, CTA_CATEGORY_LABELS) },
      { name: 'isPreferred', label: 'Tercih Edilen', type: 'boolean', default: false },
      approval(), order()
    ]
  },
  hashtags: {
    key: 'hashtags', delegate: 'brandHashtag', label: 'Hashtag', labelPlural: 'Hashtag', icon: 'hashtag',
    perm: 'edit', hasOrder: true,
    fields: [
      { name: 'tag', label: 'Etiket', type: 'string', required: true, placeholder: 'kahve (# olmadan)' },
      { name: 'category', label: 'Kategori', type: 'select', default: 'DEFAULT', options: opts(HASHTAG_CATEGORIES, HASHTAG_CATEGORY_LABELS) },
      approval(), order()
    ]
  },
  mentions: {
    key: 'mentions', delegate: 'brandMention', label: 'Mention', labelPlural: 'Mention', icon: 'users',
    perm: 'edit', hasOrder: true,
    fields: [
      { name: 'handle', label: 'Kullanıcı Adı', type: 'string', required: true, placeholder: '@marka' },
      { name: 'platform', label: 'Platform', type: 'select', options: platformOptions },
      { name: 'type', label: 'Tip', type: 'select', default: 'OFFICIAL', options: opts(MENTION_TYPES, MENTION_TYPE_LABELS) },
      { name: 'label', label: 'Etiket', type: 'string', placeholder: 'Resmi hesap' },
      { name: 'required', label: 'Zorunlu', type: 'boolean', default: false },
      approval(), order()
    ]
  },
  'visual-rules': {
    key: 'visual-rules', delegate: 'brandVisualRule', label: 'Görsel Kural', labelPlural: 'Görsel Stil', icon: 'shapes',
    perm: 'edit', hasOrder: true,
    fields: [
      { name: 'category', label: 'Kategori', type: 'select', default: 'PHOTOGRAPHY', options: opts(VISUAL_RULE_CATEGORIES, VISUAL_RULE_CATEGORY_LABELS) },
      { name: 'title', label: 'Başlık', type: 'string', required: true, placeholder: 'Doğal ışık kullan' },
      { name: 'description', label: 'Açıklama', type: 'text' },
      { name: 'recommendedKeywords', label: 'Önerilen Anahtar Kelimeler', type: 'tags', placeholder: 'sıcak, doğal, samimi' },
      { name: 'avoidKeywords', label: 'Kaçınılacak Anahtar Kelimeler', type: 'tags', placeholder: 'soğuk, yapay' },
      approval(), order()
    ]
  },
  'platform-rules': {
    key: 'platform-rules', delegate: 'brandPlatformRule', label: 'Platform Kuralı', labelPlural: 'Sosyal Medya Kuralları', icon: 'monitor',
    perm: 'edit', hasOrder: true,
    fields: [
      { name: 'platform', label: 'Platform', type: 'select', required: true, options: Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label })) },
      { name: 'contentType', label: 'İçerik Tipi', type: 'string', placeholder: 'Boş = tüm tipler (FEED, STORY...)' },
      { name: 'guidance', label: 'Yönerge', type: 'text', placeholder: 'Bu platformda samimi ve kısa bir dil kullan.' },
      { name: 'toneOverride', label: 'Ton Geçersiz Kılma', type: 'string' },
      { name: 'ctaOverride', label: 'CTA Geçersiz Kılma', type: 'string' },
      { name: 'emojiLevel', label: 'Emoji Seviyesi', type: 'select', options: [
        { value: '', label: 'Belirtilmemiş' }, { value: 'none', label: 'Yok' }, { value: 'low', label: 'Az' },
        { value: 'medium', label: 'Orta' }, { value: 'high', label: 'Çok' }
      ] },
      approval(), order()
    ]
  },
  'legal-rules': {
    key: 'legal-rules', delegate: 'brandLegalRule', label: 'Yasal Kural', labelPlural: 'Yasal ve Kampanya', icon: 'shield',
    perm: 'edit', lockSensitive: true, hasOrder: true,
    fields: [
      { name: 'category', label: 'Kategori', type: 'select', default: 'LEGAL_INFO', options: opts(LEGAL_RULE_CATEGORIES, LEGAL_RULE_CATEGORY_LABELS) },
      { name: 'key', label: 'Anahtar', type: 'string', required: true, placeholder: 'PRICE_FORMAT, KVKK_URL...' },
      { name: 'value', label: 'Değer', type: 'text', required: true, placeholder: '₺1.234,56 · DD.MM.YYYY' },
      { name: 'required', label: 'Zorunlu', type: 'boolean', default: false },
      approval(), order()
    ]
  },
  assets: {
    key: 'assets', delegate: 'brandAsset', label: 'Dosya', labelPlural: 'Marka Dosyaları', icon: 'folder',
    perm: 'manage_assets', hasOrder: true,
    fields: [
      { name: 'type', label: 'Tip', type: 'select', default: 'OTHER', options: opts(ASSET_TYPES, ASSET_TYPE_LABELS) },
      { name: 'name', label: 'Ad', type: 'string', required: true },
      { name: 'fileUrl', label: 'Dosya URL', type: 'string', placeholder: '/storage/... veya https://...' },
      { name: 'format', label: 'Format', type: 'string' },
      { name: 'tags', label: 'Etiketler', type: 'tags' },
      approval(), order()
    ]
  },
  references: {
    key: 'references', delegate: 'brandReference', label: 'Referans', labelPlural: 'Referanslar', icon: 'eye',
    perm: 'edit', hasOrder: true,
    fields: [
      { name: 'kind', label: 'Tür', type: 'select', default: 'LIKED', options: opts(REFERENCE_KINDS, REFERENCE_KIND_LABELS) },
      { name: 'title', label: 'Başlık', type: 'string' },
      { name: 'note', label: 'Not', type: 'text' },
      { name: 'fileUrl', label: 'Görsel URL', type: 'string' },
      { name: 'externalUrl', label: 'Harici Bağlantı', type: 'string', placeholder: 'https://...' },
      approval(), order()
    ]
  },
  memories: {
    key: 'memories', delegate: 'brandMemory', label: 'Hafıza Kaydı', labelPlural: 'Marka Hafızası', icon: 'database',
    perm: 'edit', hasOrder: false,
    fields: [
      { name: 'kind', label: 'Tür', type: 'select', default: 'STYLE_INSIGHT', options: opts(MEMORY_KINDS, MEMORY_KIND_LABELS) },
      { name: 'source', label: 'Kaynak', type: 'select', default: 'BRAND_KIT', options: MEMORY_SOURCES.map((v) => ({ value: v as string, label: v })) },
      { name: 'summary', label: 'Özet', type: 'text', required: true },
      { name: 'enabled', label: 'Etkin', type: 'boolean', default: true },
      approval()
    ]
  }
};

export const COLLECTION_KEYS = Object.keys(COLLECTIONS);

export function getCollection(key: string): CollectionDef | undefined {
  return COLLECTIONS[key];
}
