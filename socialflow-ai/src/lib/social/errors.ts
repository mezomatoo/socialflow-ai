/**
 * Sağlayıcı hata kodları → anlaşılır Türkçe mesajlar.
 * Kullanıcıya asla "OAuthException 190" gibi ham hata gösterilmez.
 */

/** Normalleştirilmiş sağlayıcı hata kodları (§56) — istemci ve raporlamada stabil. */
export type NormalizedErrorCode =
  | 'AUTH_REQUIRED'
  | 'TOKEN_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'MEDIA_INVALID'
  | 'CAPTION_INVALID'
  | 'RATE_LIMITED'
  | 'ACCOUNT_RESTRICTED'
  | 'PROVIDER_TEMPORARY_ERROR'
  | 'UNKNOWN_PROVIDER_ERROR';

export interface FriendlyError {
  friendlyMessage: string;
  action?: { label: string; route: string };
  retryable: boolean;
  /** Stabil hata kodu — UI ikon/aksiyon seçimi ve raporlamada kullanılır. */
  normalizedCode: NormalizedErrorCode;
}

interface ErrorRule {
  match: (code: string | null | undefined, message: string, httpStatus: number | null | undefined) => boolean;
  friendlyMessage: string;
  action?: { label: string; route: string };
  retryable: boolean;
  normalizedCode: NormalizedErrorCode;
}

const RECONNECT = { label: 'Hesabı Yeniden Bağla', route: '/app/hesaplar' };
const RETRY = { label: 'Tekrar Dene', route: '' };
const SETTINGS = { label: 'Entegrasyon Ayarları', route: '/app/ayarlar/entegrasyonlar' };

const RULES: ErrorRule[] = [
  // --- Token / yetkilendirme ---
  {
    match: (c, m) => /190/.test(c ?? '') || /expired|Session has expired|Invalid OAuth access token/i.test(m),
    friendlyMessage: 'Hesabınızın oturum süresi dolmuş. Yeniden bağlanmanız gerekiyor.',
    action: RECONNECT,
    retryable: false,
  normalizedCode: 'TOKEN_EXPIRED',
  },
  {
    match: (_c, m, s) => s === 401 || /unauthorized|invalid_token|token is not valid/i.test(m),
    friendlyMessage: 'Yetkilendirme geçersiz. Hesabınızı yeniden bağlayın.',
    action: RECONNECT,
    retryable: false,
  normalizedCode: 'TOKEN_EXPIRED',
  },
  {
    match: (_c, m, s) => s === 403 || /permission|insufficient scope|forbidden/i.test(m),
    friendlyMessage:
      'Uygulamanın bu işlem için izni yok. Hesabı bağlarken gerekli yetkileri onayladığınızdan emin olun.',
    action: RECONNECT,
    retryable: false,
  normalizedCode: 'PERMISSION_DENIED',
  },
  {
    match: (c) => /OAuthException/i.test(c ?? ''),
    friendlyMessage: 'Sosyal medya hesabınızla iletişim kurulamadı. Hesabı yeniden bağlayın.',
    action: RECONNECT,
    retryable: false,
  normalizedCode: 'AUTH_REQUIRED',
  },

  // --- Hız sınırı / sunucu ---
  {
    match: (c, m, s) => s === 429 || /rate limit|too many requests|#4 /i.test(m) || /17|32|613/.test(c ?? ''),
    friendlyMessage: 'Platform hız sınırına takıldık. Birkaç dakika içinde otomatik olarak yeniden denenecek.',
    action: RETRY,
    retryable: true,
  normalizedCode: 'RATE_LIMITED',
  },
  {
    match: (_c, _m, s) => (s ?? 0) >= 500,
    friendlyMessage: 'Platform tarafında geçici bir sorun var. Birkaç dakika içinde yeniden denenecek.',
    action: RETRY,
    retryable: true,
  normalizedCode: 'PROVIDER_TEMPORARY_ERROR',
  },
  {
    match: (_c, m) => /timeout|network|ECONNRESET|socket hang up/i.test(m),
    friendlyMessage: 'Platforma ulaşılamadı (ağ zaman aşımı). Yeniden denenecek.',
    action: RETRY,
    retryable: true,
  normalizedCode: 'PROVIDER_TEMPORARY_ERROR',
  },

  // --- Instagram ---
  {
    match: (_c, m) => /Instagram business account|professional account/i.test(m),
    friendlyMessage:
      'Instagram hesabınız işletme veya creator hesabı olmalı. Instagram uygulamasından hesap türünü değiştirip tekrar deneyin.',
    action: RECONNECT,
    retryable: false,
  normalizedCode: 'ACCOUNT_RESTRICTED',
  },
  {
    match: (c) => /INSTAGRAM_NOT_BUSINESS|IG_NOT_BUSINESS/.test(c ?? ''),
    friendlyMessage: 'Yalnızca Instagram işletme hesapları gönderi yayınlayabilir.',
    action: RECONNECT,
    retryable: false,
  normalizedCode: 'ACCOUNT_RESTRICTED',
  },
  {
    match: (_c, m) => /media_type|unsupported media|Invalid image|image download/i.test(m),
    friendlyMessage:
      'Platform bu medya dosyasını kabul etmedi. Dosya biçimini veya boyutunu kontrol edin (JPG/PNG, maksimum boyut sınırı).',
    retryable: false,
  normalizedCode: 'MEDIA_INVALID',
  },
  {
    match: (_c, m) => /aspect ratio|dimensions|resolution/i.test(m),
    friendlyMessage: 'Görsel ölçüleri platformun kabul ettiği aralıkta değil. Yeniden kırpıp deneyin.',
    retryable: false,
  normalizedCode: 'MEDIA_INVALID',
  },

  // --- X / Twitter ---
  {
    match: (c) => /duplicate content|status is a duplicate/i.test(c ?? ''),
    friendlyMessage: 'Bu metin daha önce yayınlanmış. Platform aynı içeriğin tekrarına izin vermiyor.',
    retryable: false,
  normalizedCode: 'CAPTION_INVALID',
  },
  {
    match: (_c, m) => /over (?:the maximum number of )?characters|over \d+ characters|exceeds the maximum number of characters/i.test(m),
    friendlyMessage: 'Metin X karakter sınırını aşıyor. AI ile yeniden kısaltmayı deneyin.',
    retryable: false,
  normalizedCode: 'CAPTION_INVALID',
  },

  // --- YouTube ---
  {
    match: (_c, m) => /channel not found|youtube\.thirdPartyLink|unverified/i.test(m),
    friendlyMessage:
      'YouTube kanalınız doğrulanmamış veya API erişimi kısıtlı. Google hesabınızı doğrulayın ve API projesinde YouTube Data API v3\'ü etkinleştirin.',
    action: SETTINGS,
    retryable: false,
  normalizedCode: 'ACCOUNT_RESTRICTED',
  },
  {
    match: (_c, m) => /quota/i.test(m),
    friendlyMessage: 'Günlük YouTube API kotası doldu. Yarın tekrar deneyin veya kota artırımı talep edin.',
    action: SETTINGS,
    retryable: false,
  normalizedCode: 'PROVIDER_TEMPORARY_ERROR',
  },

  // --- TikTok ---
  {
    match: (_c, m) => /audit|direct post|unauthorized.*scope/i.test(m),
    friendlyMessage:
      'TikTok doğrudan yayınlama izni uygulama denetimine tabidir. Onay beklerken videolar taslak olarak hesabınıza gönderilir.',
    action: SETTINGS,
    retryable: false,
  normalizedCode: 'ACCOUNT_RESTRICTED',
  },

  // --- Pinterest ---
  {
    match: (_c, m) => /board not found|no boards/i.test(m),
    friendlyMessage: 'Pinterest hesabınızda uygun bir pano bulunamadı. Önce bir pano oluşturun.',
    action: RECONNECT,
    retryable: false,
  normalizedCode: 'ACCOUNT_RESTRICTED',
  },

  // --- Google Business Profile ---
  {
    match: (_c, m) => /Business Profile|location not found/i.test(m),
    friendlyMessage:
      'Google İşletme Profili bulunamadı. İşletmenizin Google\'da doğrulanmış olduğundan emin olun.',
    action: RECONNECT,
    retryable: false,
  normalizedCode: 'ACCOUNT_RESTRICTED',
  },

  // --- Medya yükleme ---
  {
    match: (_c, m) => /file size|too large|payload too large/i.test(m),
    friendlyMessage: 'Dosya boyutu platformun izin verdiği sınırı aşıyor.',
    retryable: false,
  normalizedCode: 'MEDIA_INVALID',
  }
];

export function toFriendlyError(input: {
  code?: string | null;
  message?: string | null;
  httpStatus?: number | null;
}): FriendlyError {
  const code = input.code ?? null;
  const message = input.message ?? '';
  const status = input.httpStatus ?? null;

  for (const rule of RULES) {
    try {
      if (rule.match(code, message, status)) {
        return { friendlyMessage: rule.friendlyMessage, action: rule.action, retryable: rule.retryable, normalizedCode: rule.normalizedCode };
      }
    } catch {
      // kural eşleşmezse devam
    }
  }

  const temporary = status == null || status >= 500 || status === 429;
  return {
    friendlyMessage: 'Yayınlama sırasında beklenmeyen bir sorun oluştu. Birkaç dakika sonra yeniden deneyin.',
    action: RETRY,
    retryable: temporary,
    normalizedCode: temporary ? 'PROVIDER_TEMPORARY_ERROR' : 'UNKNOWN_PROVIDER_ERROR'
  };
}

/** Sağlayıcı mesajından güvenli bir özet çıkarır (log için). */
export function safeProviderMessage(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  return s.slice(0, 800);
}
