/** @type {import('next').NextConfig} */
const isProd = process.env.APP_ENV === 'production';

// Geliştirme ve üretim derlemesi AYNI `.next` klasörünü paylaştığında, üretim
// derlemesi çalışan dev sunucusunun parçalarını geçersiz kılar ve önizleme
// `Cannot find module './NNNN.js'` ile 500 döner. Bu yüzden üretim çıktısı
// ayrı bir klasöre yazılır; `next start` de aynı klasörü okur.
const distDir = process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === 'production' ? '.next-build' : '.next');

const nextConfig = {
  distDir,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  experimental: {
    // Sürücü adaptörleri ve Prisma istemcisi sunucu tarafında çalışır;
    // webpack ile paketlenmemelidir (libsql/pg yerel modüller içerir).
    serverComponentsExternalPackages: ['@prisma/client', '@libsql/client', 'libsql', '@prisma/adapter-libsql', 'pg']
  },
  // Canlı önizleme / proxy üzerinden gelen cross-origin dev isteklerine izin ver
  // (ör. https://3000-<sandbox>.e2b.app → /_next/* kaynakları).
  allowedDevOrigins: ['*.e2b.app', 'localhost', '127.0.0.1'],
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
    ];

    // X-Frame-Options YALNIZCA üretimde: SAMEORIGIN, uygulamanın başka bir sitede
    // iframe'lenmesini (clickjacking) engeller. Geliştirmede kaldırılır çünkü canlı
    // önizleme uygulamayı farklı bir origin'de (*.e2b.app) iframe içinde gösterir;
    // SAMEORIGIN bu durumda tarayıcının sayfayı render etmesini engeller.
    if (isProd) {
      securityHeaders.push({ key: 'X-Frame-Options', value: 'SAMEORIGIN' });
    }

    return [
      {
        source: '/:path*',
        headers: securityHeaders
      }
    ];
  }
};
module.exports = nextConfig;
