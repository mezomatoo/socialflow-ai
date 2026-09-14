import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SocialFlow AI — Merkezi Sosyal Medya Yönetimi',
    template: '%s · SocialFlow AI'
  },
  description:
    'Tek bir görsel ve tek bir açıklama ile tüm sosyal medya platformları için optimize edilmiş içerikler oluşturun, planlayın ve yayınlayın.',
  applicationName: 'SocialFlow AI',
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#6D28D9'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-surface-subtle text-ink antialiased">{children}</body>
    </html>
  );
}
