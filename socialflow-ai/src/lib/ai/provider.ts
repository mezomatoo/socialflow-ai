/**
 * AiProviderAdapter — sağlayıcıdan bağımsız yapay zekâ katmanı (§36)
 * ---------------------------------------------------------------------------
 * Uygulama hiçbir yerde tek bir modele/sağlayıcıya bağlı DEĞİLDİR. Tüm yapay
 * zekâ çağrıları bu arayüz üzerinden yapılır; sağlayıcı değiştirmek için yalnızca
 * yeni bir adaptör kaydedilir.
 *
 * Phase 1 yetenekleri:
 *   - textGeneration        → serbest metin üretimi
 *   - structuredGeneration  → şemaya uygun JSON üretimi (doğrulanır — §37)
 *
 * İleriki fazlar için ayrılmış yetenekler (Phase 1'de UYGULANMAZ):
 *   imageGeneration, imageEditing, vision, transcription, embeddings
 *
 * Not: Anahtarlar yalnızca sunucu tarafında okunur ve istemciye sızmaz (§71).
 * Sağlayıcı çağrısı başarısız olursa `available: false` döner; çağıran servis
 * yerel (deterministik) motora düşer, böylece AI hatası manuel içerik üretimini
 * ENGELLEMEZ (§69).
 */
import { env } from '../env';
import { AppError } from '../errors';
import { logger } from '../observability';

export type AiProviderName = 'deterministic' | 'openai' | 'anthropic';

/** Phase 2+ için ayrılmış yetenekler — şimdilik yalnızca bildirilir. */
export type AiCapability =
  | 'textGeneration'
  | 'structuredGeneration'
  | 'imageGeneration'
  | 'imageEditing'
  | 'vision'
  | 'transcription'
  | 'embeddings';

export interface AiGenerationRequest {
  /** Sistem yönergesi (güvenlik/varlık koruma kuralları dahil). */
  system: string;
  /** Kullanıcı istemi (master içerik + platform bağlamı). */
  user: string;
  /** Beklenen JSON şeması (sağlayıcıya iletilebilir). */
  schema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  /** Loglama ve kayıt için kısa görev adı (ADAPT_CAPTION, HASHTAGS, ...). */
  task: string;
  /** İstek zaman aşımı (ms). */
  timeoutMs?: number;
}

export interface AiGenerationResult<T = string> {
  /** Üretilen metin. Sağlayıcı kullanılamadıysa boş dize. */
  text: string;
  /** Şemaya göre ayrıştırılmış/doğrulanmış veri (structuredGeneration). */
  data: T | null;
  provider: AiProviderName;
  model: string | null;
  /** true → istek sağlayıcıya GİTMEDİ, sonuç deterministik motor/fallback'ten. */
  degraded: boolean;
  /** true → sağlayıcı çağrısı denendi ve başarısız oldu (§69). */
  failed: boolean;
  failureMessage?: string;
  durationMs: number;
}

export interface AiProviderAdapter {
  readonly name: AiProviderName;
  /** Bu sağlayıcının kullanılabilir olup olmadığı (anahtar/yapılandırma). */
  isAvailable(): boolean;
  capabilities(): AiCapability[];
  /** Serbest metin üretimi. */
  textGeneration(req: AiGenerationRequest): Promise<AiGenerationResult<string>>;
  /** Şemaya uygun yapılandırılmış üretim (JSON). */
  structuredGeneration<T>(req: AiGenerationRequest, validate: (raw: unknown) => T | null): Promise<AiGenerationResult<T>>;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 20_000);

/**
 * JSON metnini güvenli biçimde ayrıştırır. Kod bloğu işaretleri ve çevresel
 * gürültü temizlenir; asla ham `eval` kullanılmaz.
 */
export function parseJsonLoose<T = unknown>(text: string): T | null {
  if (!text) return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.search(/[[{]/);
  if (start > 0) cleaned = cleaned.slice(start);
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (lastBrace >= 0) cleaned = cleaned.slice(0, lastBrace + 1);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new AppError('AI_UNAVAILABLE', 'AI servisi zaman aşımına uğradı.', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
    void label;
  }
}

/* -------------------------------------------------------------------------- */
/* Deterministik (yerel) sağlayıcı                                            */
/* -------------------------------------------------------------------------- */

/**
 * Harici çağrı yapmayan yerel sağlayıcı. Yapay zekâ YOKTUR; kural tabanlı
 * metin üretir ve çağıran servislerin (semanticRewriter) taban katmanıdır.
 * Bu adaptör her zaman kullanılabilir → AI kesintisi içerik üretimini durdurmaz.
 */
export const deterministicAdapter: AiProviderAdapter = {
  name: 'deterministic',
  isAvailable: () => true,
  capabilities: () => ['textGeneration', 'structuredGeneration'],
  async textGeneration(_req: AiGenerationRequest): Promise<AiGenerationResult<string>> {
    return {
      text: '',
      data: null,
      provider: 'deterministic',
      model: null,
      degraded: true,
      failed: false,
      durationMs: 0
    };
  },
  async structuredGeneration<T>(_req: AiGenerationRequest, _validate?: (raw: unknown) => T | null): Promise<AiGenerationResult<T>> {
    return {
      text: '',
      data: null,
      provider: 'deterministic',
      model: null,
      degraded: true,
      failed: false,
      durationMs: 0
    };
  }
};

/* -------------------------------------------------------------------------- */
/* OpenAI                                                                     */
/* -------------------------------------------------------------------------- */

function openAiAdapter(): AiProviderAdapter {
  const model = env.ai.openaiModel;
  const call = async (req: AiGenerationRequest, jsonMode: boolean) => {
    const body: Record<string, unknown> = {
      model,
      temperature: req.temperature ?? 0.4,
      max_tokens: req.maxTokens ?? 1200,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user }
      ]
    };
    if (jsonMode) body.response_format = { type: 'json_object' };

    return withTimeout(
      async (signal) => {
        const res = await fetch(`${env.ai.openaiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.ai.openaiKey}`
          },
          body: JSON.stringify(body),
          signal
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new AppError('AI_UNAVAILABLE', 'AI sağlayıcısı hata döndü.', {
            cause: `HTTP ${res.status} ${detail.slice(0, 300)}`
          });
        }
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return json.choices?.[0]?.message?.content ?? '';
      },
      req.timeoutMs ?? env.ai.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      'openai'
    );
  };

  return {
    name: 'openai',
    isAvailable: () => Boolean(env.ai.openaiKey),
    capabilities: () => ['textGeneration', 'structuredGeneration'],
    async textGeneration(req: AiGenerationRequest) {
      const started = Date.now();
      try {
        const text = await call(req, false);
        return { text, data: null, provider: 'openai', model, degraded: false, failed: false, durationMs: Date.now() - started };
      } catch (error) {
        return failure(error, 'openai', model, started);
      }
    },
    async structuredGeneration<T>(req: AiGenerationRequest, validate: (raw: unknown) => T | null) {
      const started = Date.now();
      try {
        const text = await call(req, true);
        const parsed = parseJsonLoose(text);
        const data = parsed === null ? null : validate(parsed);
        return {
          text,
          data,
          provider: 'openai',
          model,
          degraded: data === null,
          failed: data === null,
          failureMessage: data === null ? 'AI yanıtı şemaya uymadı.' : undefined,
          durationMs: Date.now() - started
        };
      } catch (error) {
        return failure(error, 'openai', model, started);
      }
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Anthropic                                                                  */
/* -------------------------------------------------------------------------- */

function anthropicAdapter(): AiProviderAdapter {
  const model = env.ai.anthropicModel;
  const call = async (req: AiGenerationRequest) => {
    return withTimeout(
      async (signal) => {
        const res = await fetch(`${env.ai.anthropicBaseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ai.anthropicKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model,
            max_tokens: req.maxTokens ?? 1200,
            temperature: req.temperature ?? 0.4,
            system: req.system,
            messages: [{ role: 'user', content: req.user }]
          }),
          signal
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new AppError('AI_UNAVAILABLE', 'AI sağlayıcısı hata döndü.', {
            cause: `HTTP ${res.status} ${detail.slice(0, 300)}`
          });
        }
        const json = (await res.json()) as { content?: { type: string; text?: string }[] };
        return json.content?.map((c) => c.text ?? '').join('\n') ?? '';
      },
      req.timeoutMs ?? env.ai.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      'anthropic'
    );
  };

  return {
    name: 'anthropic',
    isAvailable: () => Boolean(env.ai.anthropicKey),
    capabilities: () => ['textGeneration', 'structuredGeneration'],
    async textGeneration(req: AiGenerationRequest) {
      const started = Date.now();
      try {
        const text = await call(req);
        return { text, data: null, provider: 'anthropic', model, degraded: false, failed: false, durationMs: Date.now() - started };
      } catch (error) {
        return failure(error, 'anthropic', model, started);
      }
    },
    async structuredGeneration<T>(req: AiGenerationRequest, validate: (raw: unknown) => T | null) {
      const started = Date.now();
      try {
        const text = await call(req);
        const parsed = parseJsonLoose(text);
        const data = parsed === null ? null : validate(parsed);
        return {
          text,
          data,
          provider: 'anthropic',
          model,
          degraded: data === null,
          failed: data === null,
          failureMessage: data === null ? 'AI yanıtı şemaya uymadı.' : undefined,
          durationMs: Date.now() - started
        };
      } catch (error) {
        return failure(error, 'anthropic', model, started);
      }
    }
  };
}

function failure(error: unknown, provider: AiProviderName, model: string | null, startedAt: number): AiGenerationResult<never> {
  const message = error instanceof Error ? error.message : 'AI çağrısı başarısız.';
  logger.warn({ event: 'ai.provider_error', provider, model, errorMessage: message });
  return {
    text: '',
    data: null,
    provider,
    model,
    degraded: true,
    failed: true,
    failureMessage: message,
    durationMs: Date.now() - startedAt
  };
}

/* -------------------------------------------------------------------------- */
/* Kayıt (registry)                                                           */
/* -------------------------------------------------------------------------- */

const ADAPTERS: Record<AiProviderName, () => AiProviderAdapter> = {
  deterministic: () => deterministicAdapter,
  openai: openAiAdapter,
  anthropic: anthropicAdapter
};

/** Yapılandırmaya göre etkin sağlayıcı (anahtar yoksa yerel motora düşer). */
export function activeProviderName(): AiProviderName {
  const configured = env.ai.provider;
  const adapter = ADAPTERS[configured]?.();
  if (configured !== 'deterministic' && adapter && adapter.isAvailable()) return configured;
  return 'deterministic';
}

/** Etkin adaptör. */
export function getAiAdapter(): AiProviderAdapter {
  return ADAPTERS[activeProviderName()]();
}

/** Bir sağlayıcı adı verilerek de adaptör alınabilir (testler için). */
export function getAdapterByName(name: AiProviderName): AiProviderAdapter {
  return ADAPTERS[name]?.() ?? deterministicAdapter;
}

/** Görünen ad (arayüzde "hangi motor" bilgisi). */
export function aiModeLabel(): string {
  switch (activeProviderName()) {
    case 'openai':
      return `OpenAI (${env.ai.openaiModel})`;
    case 'anthropic':
      return `Anthropic (${env.ai.anthropicModel})`;
    default:
      return 'Yerel Motor (Demo)';
  }
}

/** AI kullanılabilir mi? (harici sağlayıcı yapılandırılmış ve anahtarı var mı) */
export function isExternalAiAvailable(): boolean {
  return activeProviderName() !== 'deterministic' && getAiAdapter().isAvailable();
}

/** Phase 2+ yeteneklerinin şu an kapalı olduğunu bildirir (arayüz bilgisi). */
export function unavailableCapabilities(): AiCapability[] {
  const supported = new Set(getAiAdapter().capabilities());
  return (['imageGeneration', 'imageEditing', 'vision', 'transcription', 'embeddings'] as AiCapability[]).filter(
    (c) => !supported.has(c)
  );
}
