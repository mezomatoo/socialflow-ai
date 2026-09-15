/**
 * Sol menü yapısı — tamamı Türkçe (§22).
 * ---------------------------------------------------------------------------
 * Entegre menü: Faz 1 çekirdeği (474), Gelen Kutusu + Reklamlar (3eb) ve
 * AI modülleri (0d6) tek yapıda birleştirilir. Henüz çalışmayan bir modül
 * çalışıyormuş gibi gösterilmez (§22); kapı kararları phaseGates.ts'tedir.
 */

export type NavPhase = 'phase1' | 'phase2';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: 'drafts' | 'scheduled' | 'notifications';
  group: string;
  /** Modülün hangi faza ait olduğu (menüde etiketlenir). */
  phase: NavPhase;
  /** Kısa açıklama (başlık ipucu / aria-label). */
  description?: string;
}

export const NAV_GROUPS: { id: string; label: string; phase: NavPhase; items: NavItem[] }[] = [
  {
    id: 'phase1',
    label: 'Çalışma Alanı',
    phase: 'phase1',
    items: [
      { href: '/app/dashboard', label: 'Ana Sayfa', icon: 'home', group: 'phase1', phase: 'phase1' },
      { href: '/app/icerik/yeni', label: 'Yeni İçerik', icon: 'plus', group: 'phase1', phase: 'phase1' },
      {
        href: '/app/icerik/taslaklar',
        label: 'Taslaklar',
        icon: 'draft',
        badge: 'drafts',
        group: 'phase1',
        phase: 'phase1'
      },
      { href: '/app/medya', label: 'Medya Kütüphanesi', icon: 'image', group: 'phase1', phase: 'phase1' },
      { href: '/app/markalar', label: 'Markalar', icon: 'brand', group: 'phase1', phase: 'phase1' },
      { href: '/app/ayarlar', label: 'Ayarlar', icon: 'settings', group: 'phase1', phase: 'phase1' }
    ]
  },
  {
    id: 'phase2',
    label: 'Sonraki Faz Modülleri',
    phase: 'phase2',
    items: [
      { href: '/app/takvim', label: 'İçerik Takvimi', icon: 'calendar', group: 'phase2', phase: 'phase2' },
      {
        href: '/app/icerik/planlananlar',
        label: 'Planlananlar',
        icon: 'clock',
        badge: 'scheduled',
        group: 'phase2',
        phase: 'phase2'
      },
      { href: '/app/icerik/yayinlananlar', label: 'Yayınlananlar', icon: 'check-circle', group: 'phase2', phase: 'phase2' },
      { href: '/app/hesaplar', label: 'Sosyal Medya Hesapları', icon: 'users', group: 'phase2', phase: 'phase2' },
      { href: '/app/analizler', label: 'Analizler', icon: 'chart', group: 'phase2', phase: 'phase2' },
      { href: '/app/marka-kiti', label: 'Marka Kiti', icon: 'layers', group: 'phase2', phase: 'phase2' },
      {
        href: '/app/bildirimler',
        label: 'Bildirimler',
        icon: 'bell',
        badge: 'notifications',
        group: 'phase2',
        phase: 'phase2'
      }
    ]
  },
  {
    id: 'community',
    label: 'Topluluk',
    phase: 'phase2',
    items: [{ href: '/app/gelen-kutusu', label: 'Gelen Kutusu', icon: 'inbox', group: 'community', phase: 'phase2' }]
  },
  {
    id: 'advertising',
    label: 'Reklamlar',
    phase: 'phase2',
    items: [
      { href: '/app/reklamlar', label: 'Reklam Özeti', icon: 'chart', group: 'advertising', phase: 'phase2' },
      { href: '/app/reklamlar/hesaplar', label: 'Reklam Hesapları', icon: 'users', group: 'advertising', phase: 'phase2' }
    ]
  },
  {
    id: 'ai',
    label: 'Yapay Zeka',
    phase: 'phase2',
    items: [
      { href: '/app/ai-asistan', label: 'AI İçerik Asistanı', icon: 'sparkles', group: 'ai', phase: 'phase2' },
      { href: '/app/ai-studio', label: 'AI Kreatif Stüdyo', icon: 'shapes', group: 'ai', phase: 'phase2' },
      { href: '/app/ai-planlayici', label: 'AI İçerik Planlayıcı', icon: 'calendar', group: 'ai', phase: 'phase2' },
      { href: '/app/ai-kampanya', label: 'AI Kampanya Oluşturucu', icon: 'target', group: 'ai', phase: 'phase2' },
      { href: '/app/ai-gecmisi', label: 'AI Geçmişi', icon: 'history', group: 'ai', phase: 'phase2' }
    ]
  },
  {
    id: 'automation',
    label: 'Otomasyon ve İçgörü',
    phase: 'phase2',
    items: [
      { href: '/app/otomasyonlar', label: 'Otomasyonlar', icon: 'magic', group: 'automation', phase: 'phase2' },
      { href: '/app/trendler', label: 'Trendler', icon: 'chart', group: 'automation', phase: 'phase2' },
      { href: '/app/rakip-analizi', label: 'Rakip Analizi', icon: 'users', group: 'automation', phase: 'phase2' }
    ]
  },
  {
    id: 'insights',
    label: 'Sistem',
    phase: 'phase2',
    items: [
      { href: '/app/admin/ai-kullanim', label: 'AI Kullanımı', icon: 'chart', group: 'insights', phase: 'phase2' }
    ]
    ]
  }
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** Phase 1 ana menü öğeleri (doğrulama/testlerde kullanılır). */
export const PHASE1_NAV_ITEMS = ALL_NAV_ITEMS.filter((i) => i.phase === 'phase1');

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
