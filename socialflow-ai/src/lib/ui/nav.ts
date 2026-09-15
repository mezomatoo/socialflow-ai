/**
 * Sol menü yapısı — tamamı Türkçe.
 * ---------------------------------------------------------------------------
 * İşlevsel kategoriler: geliştirme fazı adları müşteri arayüzüne yansıtılmaz;
 * her modül gerçek işlevine göre kategorize edilir. Henüz çalışmayan bir modül
 * çalışıyormuş gibi gösterilmez; kapı kararları phaseGates.ts'tedir.
 * Tüm yollar korunur (yer imleri bozulmaz); yalnızca gruplama değişir.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: 'drafts' | 'scheduled' | 'notifications';
  group: string;
  /** Yalnızca OWNER/ADMIN görebilir (yönetici operasyon sayfaları). */
  adminOnly?: boolean;
  /** Kısa açıklama (başlık ipucu / aria-label). */
  description?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'content',
    label: 'İçerik',
    items: [
      { href: '/app/dashboard', label: 'Ana Sayfa', icon: 'home', group: 'content' },
      { href: '/app/icerik/yeni', label: 'Yeni İçerik', icon: 'plus', group: 'content' },
      {
        href: '/app/icerik/taslaklar',
        label: 'Taslaklar',
        icon: 'draft',
        badge: 'drafts',
        group: 'content'
      },
      {
        href: '/app/icerik/planlananlar',
        label: 'Planlananlar',
        icon: 'clock',
        badge: 'scheduled',
        group: 'content'
      },
      { href: '/app/icerik/yayinlananlar', label: 'Yayınlananlar', icon: 'check-circle', group: 'content' },
      { href: '/app/takvim', label: 'İçerik Takvimi', icon: 'calendar', group: 'content' }
    ]
  },
  {
    id: 'brand',
    label: 'Marka Yönetimi',
    items: [
      { href: '/app/markalar', label: 'Markalar', icon: 'brand', group: 'brand' },
      { href: '/app/marka-kiti', label: 'Marka Kiti', icon: 'layers', group: 'brand' }
    ]
  },
  {
    id: 'ai',
    label: 'AI & Kreatif',
    items: [
      { href: '/app/ai-asistan', label: 'AI İçerik Asistanı', icon: 'sparkles', group: 'ai' },
      { href: '/app/ai-studio', label: 'AI Stüdyo', icon: 'shapes', group: 'ai' },
      { href: '/app/ai-planlayici', label: 'AI Planlayıcı', icon: 'calendar', group: 'ai' },
      { href: '/app/ai-kampanya', label: 'AI Kampanya Oluşturucu', icon: 'target', group: 'ai' },
      { href: '/app/ai-gecmisi', label: 'AI Geçmişi', icon: 'history', group: 'ai' }
    ]
  },
  {
    id: 'automation',
    label: 'Otomasyon ve İçgörü',
    items: [
      { href: '/app/otomasyonlar', label: 'Otomasyonlar', icon: 'magic', group: 'automation' },
      { href: '/app/trendler', label: 'Trendler', icon: 'chart', group: 'automation' },
      { href: '/app/rakip-analizi', label: 'Rakip Analizi', icon: 'users', group: 'automation' }
    ]
  },
  {
    id: 'media',
    label: 'Medya',
    items: [{ href: '/app/medya', label: 'Medya Kütüphanesi', icon: 'image', group: 'media' }]
  },
  {
    id: 'accounts',
    label: 'Hesaplar',
    items: [{ href: '/app/hesaplar', label: 'Sosyal Medya Hesapları', icon: 'users', group: 'accounts' }]
  },
  {
    id: 'performance',
    label: 'Performans',
    items: [{ href: '/app/analizler', label: 'Analizler', icon: 'chart', group: 'performance' }]
  },
  {
    id: 'community',
    label: 'Topluluk',
    items: [{ href: '/app/gelen-kutusu', label: 'Gelen Kutusu', icon: 'inbox', group: 'community' }]
  },
  {
    id: 'advertising',
    label: 'Reklamlar',
    items: [
      { href: '/app/reklamlar', label: 'Reklam Özeti', icon: 'chart', group: 'advertising' },
      { href: '/app/reklamlar/hesaplar', label: 'Reklam Hesapları', icon: 'users', group: 'advertising' }
    ]
  },
  {
    id: 'system',
    label: 'Sistem',
    items: [
      {
        href: '/app/bildirimler',
        label: 'Bildirimler',
        icon: 'bell',
        badge: 'notifications',
        group: 'system'
      },
      { href: '/app/admin/ai-kullanim', label: 'AI Kullanımı', icon: 'chart', group: 'system', adminOnly: true },
      { href: '/app/admin/sistem', label: 'Sistem Durumu', icon: 'database', group: 'system', adminOnly: true },
      { href: '/app/ayarlar', label: 'Ayarlar', icon: 'settings', group: 'system' }
    ]
  }
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function navLabelFor(pathname: string): string {
  const exact = ALL_NAV_ITEMS.find((i) => i.href === pathname);
  if (exact) return exact.label;
  const prefix = ALL_NAV_ITEMS.find((i) => pathname.startsWith(`${i.href}/`));
  return prefix?.label ?? 'SocialFlow AI';
}

/** Eski (Phase 0 demo) yollar → yeni yollar. Bilinmeyen yol için null. */
export const LEGACY_ROUTE_REDIRECTS: Record<string, string> = {
  '/anasayfa': '/app/dashboard',
  '/yeni-icerik': '/app/icerik/yeni',
  '/taslaklar': '/app/icerik/taslaklar',
  '/planlananlar': '/app/icerik/planlananlar',
  '/yayinlananlar': '/app/icerik/yayinlananlar',
  '/medya': '/app/medya',
  '/marka-profilleri': '/app/markalar',
  '/sosyal-hesaplar': '/app/hesaplar',
  '/takvim': '/app/takvim',
  '/analizler': '/app/analizler',
  '/bildirimler': '/app/bildirimler',
  '/ai-asistan': '/app/ai-asistan',
  '/ayarlar': '/app/ayarlar',
  '/marka-kiti': '/app/marka-kiti',
  '/gelen-kutusu': '/app/gelen-kutusu',
  '/ai-studio': '/app/ai-studio',
  '/ai-planlayici': '/app/ai-planlayici',
  '/ai-kampanya': '/app/ai-kampanya',
  '/ai-gecmisi': '/app/ai-gecmisi',
  '/otomasyonlar': '/app/otomasyonlar',
  '/trendler': '/app/trendler',
  '/rakip-analizi': '/app/rakip-analizi',
  '/admin/ai-kullanim': '/app/admin/ai-kullanim'
};

export function legacyRedirectFor(pathname: string): string | null {
  if (LEGACY_ROUTE_REDIRECTS[pathname]) return LEGACY_ROUTE_REDIRECTS[pathname];
  for (const [from, to] of Object.entries(LEGACY_ROUTE_REDIRECTS)) {
    if (pathname.startsWith(`${from}/`)) return `${to}${pathname.slice(from.length)}`;
  }
  return null;
}
