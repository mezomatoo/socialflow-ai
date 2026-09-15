import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { legacyRedirectFor } from '@/lib/ui/nav';

/**
 * Oturum koruması (edge middleware) ve yol yönlendirmeleri.
 * Yalnızca çerezin VARLIĞINI kontrol eder — hızlıdır ve veritabanına gitmez.
 * Gerçek yetkilendirme her API route'unda ve sunucu bileşeninde yapılır
 * (çalışma alanı izolasyonu dahil).
 */

/** Oturum gerektiren yol önekleri (§21). Eski yollar önce legacyRedirectFor ile yeni yapıya yönlenir. */
const PROTECTED_PREFIXES = ['/app'];

/** Oturum açmış kullanıcıyı panele yönlendiren sayfalar. */
const AUTH_PAGES = ['/giris', '/kayit', '/sifremi-unuttum', '/sifremi-sifirla'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get('sf_session')?.value);

  // Önizleme kolaylığı: çerez saklamayan iframe'de oturum çerezi geri
  // gönderilemediğinden, geliştirme ortamında korumalı sayfalara erişime
  // izin verilir (gerçek yetkilendirme sunucu tarafında getSession() içinde
  // otomatik oturuma düşerek yapılır). Üretimde (APP_ENV=production) kapalıdır.
  // Demo Modu (DEMO_MODE) bundan bağımsızdır; yalnızca demo uyarılarını etkiler.
  const previewAuth =
    process.env.APP_ENV !== 'production' &&
    process.env.PREVIEW_AUTOLOGIN !== 'false';
  const effectiveSession = hasSessionCookie || previewAuth;

  // Eski yollar yeni yapıya kalıcı olarak yönlendirilir (kırık bağlantı olmasın).
  const legacy = legacyRedirectFor(pathname);
  if (legacy) {
    const url = request.nextUrl.clone();
    url.pathname = legacy;
    return NextResponse.redirect(url, 308);
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isProtected && !effectiveSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/giris';
    url.searchParams.set('yonlendir', pathname);
    return NextResponse.redirect(url);
  }

  // Giriş/kayıt sayfaları yalnızca GERÇEK bir çerez oturumu varsa panele
  // yönlendirilir; önizlemede (çerez yok) bu sayfalar erişilebilir kalır.
  if (isAuthPage && hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/app/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = effectiveSession ? '/app/dashboard' : '/giris';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|storage|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|map)$).*)']
};
