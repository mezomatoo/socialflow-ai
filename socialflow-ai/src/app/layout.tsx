import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SocialFlow AI — Merkezi Sosyal Medya Yönetimi',
    template: '%s · SocialFlow AI'
  },
  description:
    'Tek bir ana açıklama ve görselden tüm platformlara özel metin ve görsel varyantları üretin; platform kurallarını kontrol edin ve taslaklarınızı yönetin.',
  applicationName: 'SocialFlow AI',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'SocialFlow AI', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }]
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#6D28D9',
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-surface-subtle text-ink antialiased">{children}</body>
    </html>
  );
}
