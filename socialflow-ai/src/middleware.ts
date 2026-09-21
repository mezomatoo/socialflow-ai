import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { legacyRedirectFor } from '@/lib/ui/nav';
import { securityHeaders } from '@/lib/security/headers';
import { env } from '@/lib/env';

/** Tüm sayfa yanıtlarına uygulanan üretim güvenlik başlıkları (§43). */
const SECURITY_HEADERS = securityHeaders(env.isProduction);

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

  const respond = (response: NextResponse): NextResponse => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  };

  // Önizleme kolaylığı: çerez saklamayan iframe'de oturum çerezi geri
  // gönderilemediğinden, GELİŞTİRME ortamında ve DEMO_MODE=true iken korumalı
  // sayfalara erişime izin verilir (gerçek yetkilendirme sunucu tarafında
  // getSession() içinde yapılır). Üretimde (APP_ENV=production) ASLA açılmaz.
  const previewAuth =
    process.env.APP_ENV !== 'production' &&
    process.env.DEMO_MODE === 'true' &&
    process.env.PREVIEW_AUTOLOGIN !== 'false';
  const effectiveSession = hasSessionCookie || previewAuth;

  // Eski yollar yeni yapıya kalıcı olarak yönlendirilir (kırık bağlantı olmasın).
  const legacy = legacyRedirectFor(pathname);
  if (legacy) {
    const url = request.nextUrl.clone();
    url.pathname = legacy;
    return respond(NextResponse.redirect(url, 308));
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isProtected && !effectiveSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/giris';
    url.searchParams.set('yonlendir', pathname);
    return respond(NextResponse.redirect(url));
  }

  // Giriş/kayıt sayfaları yalnızca GERÇEK bir çerez oturumu varsa panele
  // yönlendirilir; önizlemede (çerez yok) bu sayfalar erişilebilir kalır.
  if (isAuthPage && hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/app/dashboard';
    url.search = '';
    return respond(NextResponse.redirect(url));
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = effectiveSession ? '/app/dashboard' : '/giris';
    return respond(NextResponse.redirect(url));
  }

  return respond(NextResponse.next());
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|storage|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|map)$).*)']
};
