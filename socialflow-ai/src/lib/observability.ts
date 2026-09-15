/**
 * Gözlemlenebilirlik (§73)
 * ---------------------------------------------------------------------------
 * - Yapılandırılmış (JSON satırı) loglar: seviye, zaman, istek kimliği, olay.
 * - İstek kimliği (request id) başlıktan okunur veya üretilir ve tüm log
 *   satırlarına eklenir; hatalarda istemciye `X-Request-Id` olarak döner.
 * - ASLA loglanmaz: şifreler, oturum çerezleri, erişim/yenileme token'ları,
 *   gizli anahtarlar. `redact()` bu alanları temizler.
 */

const SECRET_KEYS = [
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'clientsecret',
  'client_secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'secret',
  'sessionsecret',
  'tokenencryptionkey'
];

/** Gizli alanları loglanabilir hâle getirir. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.includes(k.toLowerCase()) ? '[gizli]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  event: string;
  requestId?: string;
  workspaceId?: string | null;
  userId?: string | null;
  durationMs?: number;
  [key: string]: unknown;
}

/** Yapılandırılmış log satırı yazar. */
export function log(level: LogLevel, fields: LogFields) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    ...(redact(fields) as Record<string, unknown>)
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (f: LogFields) => log('debug', f),
  info: (f: LogFields) => log('info', f),
  warn: (f: LogFields) => log('warn', f),
  error: (f: LogFields) => log('error', f)
};

export function newRequestId(): string {
  return `req_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** İstekten (veya yeni üretilerek) istek kimliği çözer. */
export function requestIdOf(request?: Request): string {
  const header = request?.headers?.get('x-request-id');
  if (header && header.length <= 128) return header;
  return newRequestId();
}

let errorReporter: ((error: unknown, fields: LogFields) => void) | null = null;

/**
 * Hata raporlama kancası (§73). Varsayılan olarak yapılandırılmış log yazar;
 * üretimde Sentry vb. bağlamak için bu fonksiyon kullanılır.
 */
export function setErrorReporter(fn: (error: unknown, fields: LogFields) => void) {
  errorReporter = fn;
}

export function reportError(error: unknown, fields: LogFields) {
  if (errorReporter) {
    try {
      errorReporter(error, fields);
    } catch {
      // raporlayıcı hatası ana akışı bozmasın
    }
  }
  logger.error({
    ...fields,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.split('\n').slice(0, 6).join(' | ') : undefined
  });
}
