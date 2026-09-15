/**
 * Merkezi ortam değişkeni erişimi.
 * Gizli anahtarlar hiçbir zaman tarayıcıya (NEXT_PUBLIC_*) sızdırılmaz.
 */

function str(key: string, fallback = ''): string {
  const v = process.env[key];
  return v === undefined || v === null ? fallback : v;
}

function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function int(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}

export const env = {
  appUrl: str('APP_URL', 'http://localhost:3000'),
  appEnv: str('APP_ENV', process.env.NODE_ENV || 'development'),
  isProduction:
    str('APP_ENV', process.env.NODE_ENV || 'development') === 'production' ||
    process.env.NODE_ENV === 'production',
  sessionSecret: str('SESSION_SECRET', 'dev-only-insecure-secret-change-me'),
  tokenEncryptionKey: str('TOKEN_ENCRYPTION_KEY', ''),
  storageDriver: str('STORAGE_DRIVER', 'local') as 'local' | 's3',
  storageLocalDir: str('STORAGE_LOCAL_DIR', './storage'),
  email: {
    provider: str('EMAIL_PROVIDER', ''),
    from: str('EMAIL_FROM', 'SocialFlow AI <noreply@socialflow.ai>'),
    smtp: {
      host: str('SMTP_HOST'),
      port: int('SMTP_PORT', 587),
      user: str('SMTP_USER'),
      pass: str('SMTP_PASS'),
      secure: bool('SMTP_SECURE', false)
    },
    resendApiKey: str('RESEND_API_KEY'),
    sendgridApiKey: str('SENDGRID_API_KEY')
  },
  s3: {
    endpoint: str('S3_ENDPOINT'),
    region: str('S3_REGION'),
    bucket: str('S3_BUCKET'),
    accessKeyId: str('S3_ACCESS_KEY_ID'),
    secretAccessKey: str('S3_SECRET_ACCESS_KEY'),
    forcePathStyle: bool('S3_FORCE_PATH_STYLE', true)
  },
  ai: {
    provider: str('AI_PROVIDER', 'deterministic') as 'deterministic' | 'openai' | 'anthropic',
    demoMode: bool('AI_DEMO_MODE', true),
    openaiKey: str('OPENAI_API_KEY'),
    // Taban URL yapılandırılabilir: kurumsal ağ geçitleri (Azure OpenAI, LiteLLM,
    // vLLM) ve testler aynı kodla çalışabilsin.
    openaiBaseUrl: str('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, ''),
    openaiModel: str('OPENAI_MODEL', 'gpt-4o-mini'),
    anthropicKey: str('ANTHROPIC_API_KEY'),
    anthropicBaseUrl: str('ANTHROPIC_BASE_URL', 'https://api.anthropic.com/v1').replace(/\/+$/, ''),
    anthropicModel: str('ANTHROPIC_MODEL', 'claude-3-5-sonnet-latest'),
    /** Yapay zekâ çağrısı zaman aşımı (ms). Dolduğunda yerel motora düşülür. */
    timeoutMs: int('AI_TIMEOUT_MS', 20_000)
  },
  /** Gerçek sosyal medya paylaşımı kapalıysa true. */
  demoMode: bool('DEMO_MODE', true),
  rateLimit: {
    windowMs: int('RATE_LIMIT_WINDOW_MS', 60_000),
    max: int('RATE_LIMIT_MAX', 120)
  },
  /** Sağlayıcı kimlik bilgileri — yalnızca sunucu tarafında okunur. */
  providers: {
    INSTAGRAM: { id: str('INSTAGRAM_APP_ID'), secret: str('INSTAGRAM_APP_SECRET') },
    FACEBOOK: { id: str('FACEBOOK_APP_ID'), secret: str('FACEBOOK_APP_SECRET') },
    LINKEDIN: { id: str('LINKEDIN_CLIENT_ID'), secret: str('LINKEDIN_CLIENT_SECRET') },
    X: { id: str('X_CLIENT_ID'), secret: str('X_CLIENT_SECRET') },
    TIKTOK: { id: str('TIKTOK_CLIENT_KEY'), secret: str('TIKTOK_CLIENT_SECRET') },
    YOUTUBE: { id: str('YOUTUBE_CLIENT_ID'), secret: str('YOUTUBE_CLIENT_SECRET') },
    THREADS: { id: str('THREADS_APP_ID'), secret: str('THREADS_APP_SECRET') },
    PINTEREST: { id: str('PINTEREST_APP_ID'), secret: str('PINTEREST_APP_SECRET') },
    GOOGLE_BUSINESS: { id: str('GOOGLE_CLIENT_ID'), secret: str('GOOGLE_CLIENT_SECRET') }
  } as Record<string, { id: string; secret: string }>,
  queue: {
    pollIntervalMs: int('QUEUE_POLL_INTERVAL_MS', 5000),
    concurrency: int('QUEUE_CONCURRENCY', 2)
  }
};

/** Sağlayıcının API kimlik bilgileri tanımlı mı? */
export function providerCredentialsConfigured(platform: string): boolean {
  const c = env.providers[platform];
  return Boolean(c && c.id && c.secret);
}
