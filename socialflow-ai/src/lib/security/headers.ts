/**
 * Üretim güvenlik başlıkları (Faz 7 §43, §44)
 * ---------------------------------------------------------------------------
 * Sayfa yanıtlarına uygulanır. Çerçeve koruması (X-Frame-Options /
 * frame-ancestors) YALNIZCA üretimde etkindir: geliştirme/önizlemede uygulama
 * iframe içinde gömülü çalışabilmelidir. CSP, Next.js bootstrap script'leriyle
 * uyum için 'unsafe-inline' içerir (nonce tabanlı sıkılaştırma bilinen teknik
 * borcu olarak belgelenmiştir) — yine de object-src/base-uri/frame-ancestors
 * gibi vektörleri kapatır.
 */

export interface SecurityHeaders {
  [header: string]: string;
}

export function securityHeaders(isProduction: boolean): SecurityHeaders {
  const headers: SecurityHeaders = {
    // MIME karıştırma saldırılarına karşı (hem sayfa hem API için anlamlı).
    'X-Content-Type-Options': 'nosniff',
    // Dış sitelere gönderilen yönlendirme bilgisini kısıtlar.
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Tarayıcı özelliklerini kapat (uygulama kamera/mikrofon/konum istemez).
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };

  if (isProduction) {
    // HTTPS zorunluluğu (§44): üretimde tarayıcıya 2 yıl HSTS.
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
    // Tıklama kaçırma (clickjacking) koruması — yalnızca üretimde, çerçeve
    // gömmeyi tamamen kapatır.
    headers['X-Frame-Options'] = 'DENY';
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      // Medya harici (S3/CDN) adreslerinden görüntülenebilir; veri/blob önizlemeler için data:/blob:.
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline'",
      // Next.js bootstrap inline script'leri için 'unsafe-inline' gerekir; eval yalnızca geliştirme araçları içindir.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  }

  return headers;
}

/** Verilen yanıta güvenlik başlıklarını uygular ve aynı yanıtı döndürür. */
export function applySecurityHeaders<T extends { headers: { set(k: string, v: string): unknown } }>(
  response: T,
  isProduction: boolean
): T {
  const headers = securityHeaders(isProduction);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
