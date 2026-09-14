/** Sol menü yapısı — tamamı Türkçe. */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: 'drafts' | 'scheduled' | 'notifications';
  group: string;
}

export const NAV_GROUPS: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: 'main',
    label: 'Genel',
    items: [
      { href: '/anasayfa', label: 'Ana Sayfa', icon: 'home', group: 'main' },
      { href: '/yeni-icerik', label: 'Yeni İçerik', icon: 'plus', group: 'main' },
      { href: '/takvim', label: 'İçerik Takvimi', icon: 'calendar', group: 'main' }
    ]
  },
  {
    id: 'content',
    label: 'İçerik',
    items: [
      { href: '/taslaklar', label: 'Taslaklar', icon: 'draft', badge: 'drafts', group: 'content' },
      { href: '/planlananlar', label: 'Planlananlar', icon: 'clock', badge: 'scheduled', group: 'content' },
      { href: '/yayinlananlar', label: 'Yayınlananlar', icon: 'check-circle', group: 'content' },
      { href: '/medya', label: 'Medya Kütüphanesi', icon: 'image', group: 'content' }
    ]
  },
  {
    id: 'brand',
    label: 'Marka ve Hesaplar',
    items: [
      { href: '/sosyal-hesaplar', label: 'Sosyal Medya Hesapları', icon: 'users', group: 'brand' },
      { href: '/marka-profilleri', label: 'Marka Profilleri', icon: 'brand', group: 'brand' },
      { href: '/marka-kiti', label: 'Marka Kiti', icon: 'layers', group: 'brand' }
    ]
  },
  {
    id: 'ai',
    label: 'Yapay Zeka',
    items: [
      { href: '/ai-asistan', label: 'AI İçerik Asistanı', icon: 'sparkles', group: 'ai' },
      { href: '/ai-studio', label: 'AI Kreatif Stüdyo', icon: 'shapes', group: 'ai' },
      { href: '/ai-planlayici', label: 'AI İçerik Planlayıcı', icon: 'calendar', group: 'ai' },
      { href: '/ai-kampanya', label: 'AI Kampanya Oluşturucu', icon: 'target', group: 'ai' },
      { href: '/ai-gecmisi', label: 'AI Geçmişi', icon: 'history', group: 'ai' }
    ]
  },
  {
    id: 'automation',
    label: 'Otomasyon ve İçgörü',
    items: [
      { href: '/otomasyonlar', label: 'Otomasyonlar', icon: 'magic', group: 'automation' },
      { href: '/trendler', label: 'Trendler', icon: 'chart', group: 'automation' },
      { href: '/rakip-analizi', label: 'Rakip Analizi', icon: 'users', group: 'automation' }
    ]
  },
  {
    id: 'insights',
    label: 'Sistem',
    items: [
      { href: '/analizler', label: 'Analizler', icon: 'chart', group: 'insights' },
      { href: '/bildirimler', label: 'Bildirimler', icon: 'bell', badge: 'notifications', group: 'insights' },
      { href: '/admin/ai-kullanim', label: 'AI Kullanımı', icon: 'chart', group: 'insights' },
      { href: '/ayarlar', label: 'Ayarlar', icon: 'settings', group: 'insights' }
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
