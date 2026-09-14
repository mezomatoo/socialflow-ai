import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Oturum koruması (edge middleware).
 * Yalnızca çerezin VARLIĞINI kontrol eder — hızlıdır ve veritabanına gitmez.
 * Gerçek yetkilendirme her API route'unda ve sunucu bileşenlerinde yapılır.
 */

const PROTECTED_PREFIXES = [
  '/anasayfa',
  '/yeni-icerik',
  '/takvim',
  '/taslaklar',
  '/planlananlar',
  '/yayinlananlar',
  '/medya',
  '/sosyal-hesaplar',
  '/marka-profilleri',
  '/ai-asistan',
  '/analizler',
  '/bildirimler',
  '/ayarlar',
  '/arama'
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get('sf_session')?.value);

  // Önizleme/demo kolaylığı: çerez saklamayan iframe'de oturum çerezi geri
  // gönderilemediğinden, geliştirme + demo modunda korumalı sayfalara erişime
  // izin verilir (gerçek yetkilendirme sunucu tarafında getSession() içinde
  // demo kullanıcıya düşerek yapılır). Üretimde (APP_ENV=production) kapalıdır.
  const previewAuth =
    process.env.APP_ENV !== 'production' &&
    process.env.DEMO_MODE !== 'false' &&
    process.env.PREVIEW_AUTOLOGIN !== 'false';
  const effectiveSession = hasSessionCookie || previewAuth;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPage = pathname === '/giris' || pathname === '/kayit';

  if (isProtected && !effectiveSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/giris';
    url.searchParams.set('yonlendir', pathname);
    return NextResponse.redirect(url);
  }

  // /giris yalnızca GERÇEK bir çerez oturumu varsa panele yönlendirilir;
  // önizlemede (çerez yok) giriş sayfası erişilebilir kalır.
  if (isAuthPage && hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/anasayfa';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = effectiveSession ? '/anasayfa' : '/giris';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|storage|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|map)$).*)']
};
