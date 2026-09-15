import prisma from '../prisma';
import { env } from '../env';
import { fromCipherText } from '../crypto';
import { logger } from '../observability';

export type AiProviderChoice = 'deterministic' | 'openai' | 'anthropic' | 'gemini';

export interface AiWorkspaceConfig {
  provider: AiProviderChoice;
  model: string | null;
  /** Çözülmüş API anahtarı (DB şifreli kayıttan veya ortam değişkeninden). */
  key: string | null;
  baseUrl: string | null;
  /** Anahtar çalışma alanının kendi kaydıysa true (panodan girilmiş). */
  keyFromWorkspace: boolean;
}

/**
 * Güncel model kataloğu (Eylül 2026). Sağlayıcının canlı `/models` uç noktası
 * erişilebildiğinde ASIL kaynak odur; bu liste çevrimdışı öneri/yalnızca-
 * başlangıç setidir ve model giriş alanı her durumda serbest metin kabul eder.
 */
export const AI_PROVIDER_DEFAULTS: Record<
  Exclude<AiProviderChoice, 'deterministic'>,
  { model: string; baseUrl: string; label: string; keyPlaceholder: string; models: string[] }
> = {
  openai: {
    model: 'gpt-5.4-mini',
    baseUrl: 'https://api.openai.com/v1',
    label: 'OpenAI',
    keyPlaceholder: 'sk-...',
    models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini', 'o4-mini']
  },
  anthropic: {
    model: 'claude-sonnet-4-6',
    baseUrl: 'https://api.anthropic.com/v1',
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-...',
    models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-fable-5', 'claude-haiku-4-5', 'claude-opus-4-5', 'claude-sonnet-4-5']
  },
  gemini: {
    // Gemini, OpenAI uyumlu uç noktası üzerinden çağrılır (ayrı adaptör gerekmez).
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    label: 'Google Gemini',
    keyPlaceholder: 'AIza...',
    models: ['gemini-3.8-flash', 'gemini-3.1-pro', 'gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite']
  }
};

/**
 * Sağlayıcı adı geçerli mi? (Panodan gelen değerler doğrulanır.)
 */
export function isAiProviderChoice(value: unknown): value is AiProviderChoice {
  return value === 'deterministic' || value === 'openai' || value === 'anthropic' || value === 'gemini';
}

/**
 * Yapılandırma çözümleme önceliği:
 *   1. Çalışma alanının panoda kaydettiği sağlayıcı/model/anahtar
 *   2. Sağlayıcının ortam değişkeni anahtarı (OPENAI_API_KEY vb.)
 *   3. Anahtar hiç yoksa → yerel deterministik motor (asla hata verilmez)
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; config: AiWorkspaceConfig }>();

function envKeyFor(provider: AiProviderChoice): string | null {
  switch (provider) {
    case 'openai':
      return env.ai.openaiKey || null;
    case 'anthropic':
      return env.ai.anthropicKey || null;
    default:
      return null; // gemini ortam anahtarı desteklenmez; anahtar panodan girilir
  }
}

function envModelFor(provider: AiProviderChoice): string | null {
  switch (provider) {
    case 'openai':
      return env.ai.openaiModel || null;
    case 'anthropic':
      return env.ai.anthropicModel || null;
    default:
      return null;
  }
}

function envBaseUrlFor(provider: AiProviderChoice): string | null {
  switch (provider) {
    case 'openai':
      return env.ai.openaiBaseUrl !== 'https://api.openai.com/v1' ? env.ai.openaiBaseUrl : null;
    case 'anthropic':
      return env.ai.anthropicBaseUrl !== 'https://api.anthropic.com/v1' ? env.ai.anthropicBaseUrl : null;
    default:
      return null;
  }
}

export async function getWorkspaceAiConfig(workspaceId: string): Promise<AiWorkspaceConfig> {
  const hit = cache.get(workspaceId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.config;

  const settings = await prisma.appSettings.findUnique({
    where: { workspaceId },
    select: { aiProvider: true, aiModel: true, aiApiKeyEnc: true, aiBaseUrl: true }
  });

  const provider: AiProviderChoice = isAiProviderChoice(settings?.aiProvider) ? settings.aiProvider : 'deterministic';
  let key: string | null = null;
  let keyFromWorkspace = false;

  if (settings?.aiApiKeyEnc) {
    try {
      key = fromCipherText(settings.aiApiKeyEnc);
      keyFromWorkspace = true;
    } catch {
      logger.warn({ event: 'ai.key_decrypt_failed', workspaceId });
      key = null;
    }
  }
  if (!key) key = envKeyFor(provider);

  const defaults = provider !== 'deterministic' ? AI_PROVIDER_DEFAULTS[provider] : null;
  const config: AiWorkspaceConfig = {
    provider,
    model: settings?.aiModel || (defaults ? envModelFor(provider) || defaults.model : null),
    key,
    baseUrl: settings?.aiBaseUrl || envBaseUrlFor(provider) || defaults?.baseUrl || null,
    keyFromWorkspace
  };

  cache.set(workspaceId, { at: Date.now(), config });
  return config;
}

/** Eşzamanlı okuma (yalnızca önbellek doluysa değer döner; yoksa null). */
export function getCachedWorkspaceAiConfig(workspaceId: string): AiWorkspaceConfig | null {
  const hit = cache.get(workspaceId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.config;
  return null;
}

/** Ayar kaydedildiğinde önbelleği düşür. */
export function invalidateWorkspaceAiConfig(workspaceId: string): void {
  cache.delete(workspaceId);
}

/** Anahtarın maskeli görünümü (arayüzde "sk-...abcd"). */
export function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}
