/**
 * Normalize edilmiş uygulama hataları (§68)
 * ---------------------------------------------------------------------------
 * Tüm katmanlar (servisler, API, kuyruk işleri) bu sınıfları kullanır.
 * Kullanıcıya gösterilen mesajlar HER ZAMAN Türkçe ve anlaşılırdır; teknik
 * ayrıntılar (stack, sağlayıcı ham hatası) yalnızca sunucu loglarına gider.
 *
 * Kodlar istemci tarafında davranış seçmek için kullanılır (ör. AI servisine
 * ulaşılamadığında kullanıcının elle düzenlemeye devam edebilmesi — §69).
 */

export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_OUTPUT'
  | 'MEDIA_UPLOAD_FAILED'
  | 'MEDIA_PROCESSING_FAILED'
  | 'STORAGE_ERROR'
  | 'PLATFORM_RULE_VIOLATION'
  | 'PROVIDER_UNAVAILABLE'
  | 'QUEUE_ERROR'
  | 'MODULE_NOT_ENABLED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  code: AppErrorCode;
  status: number;
  /** Kullanıcıya gösterilecek Türkçe mesaj. */
  userMessage: string;
  details?: unknown;
  /** Teknik ayrıntı — loglanır, istemciye gönderilmez. */
  cause?: unknown;
  /** İstemcinin özel davranış (retry, manuel düzenleme) seçmesi için ipucu. */
  recoverable: boolean;

  constructor(
    code: AppErrorCode,
    userMessage: string,
    options: { status?: number; details?: unknown; cause?: unknown; recoverable?: boolean } = {}
  ) {
    super(userMessage);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? 400;
    this.userMessage = userMessage;
    this.details = options.details;
    this.cause = options.cause;
    this.recoverable = options.recoverable ?? true;
  }

  toJSON() {
    return { code: this.code, message: this.userMessage, details: this.details, recoverable: this.recoverable };
  }
}

/** AI sağlayıcısına ulaşılamadı (manuel düzenlemeye devam edilebilir — §69). */
export function aiUnavailable(cause?: unknown) {
  return new AppError('AI_UNAVAILABLE', 'AI servisine şu anda ulaşılamıyor. Metinleri elle düzenleyebilir veya daha sonra tekrar deneyebilirsiniz.', {
    status: 503,
    cause,
    recoverable: true
  });
}

/** Model geçersiz/şemaya uymayan çıktı üretti (§37). */
export function aiInvalidOutput(cause?: unknown) {
  return new AppError('AI_INVALID_OUTPUT', 'AI yanıtı doğrulanamadı. Lütfen tekrar deneyin veya metni elle düzenleyin.', {
    status: 502,
    cause,
    recoverable: true
  });
}

export function mediaUploadFailed(cause?: unknown, details?: unknown) {
  return new AppError('MEDIA_UPLOAD_FAILED', 'Medya dosyası yüklenemedi.', { status: 400, cause, details });
}

export function mediaProcessingFailed(cause?: unknown, details?: unknown) {
  return new AppError('MEDIA_PROCESSING_FAILED', 'Medya işlenemedi. Orijinal dosyanız korunuyor.', {
    status: 422,
    cause,
    details,
    recoverable: true
  });
}

export function platformRuleViolation(message: string, details?: unknown) {
  return new AppError('PLATFORM_RULE_VIOLATION', message, { status: 422, details, recoverable: true });
}

export function notFound(message = 'Kayıt bulunamadı.') {
  return new AppError('NOT_FOUND', message, { status: 404, recoverable: false });
}

export function forbidden(message = 'Bu işlem için yetkiniz bulunmuyor.') {
  return new AppError('FORBIDDEN', message, { status: 403, recoverable: false });
}

export function validationError(message: string, details?: unknown) {
  return new AppError('VALIDATION_ERROR', message, { status: 400, details });
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
