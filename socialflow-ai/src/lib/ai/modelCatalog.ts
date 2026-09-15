import { AI_PROVIDER_DEFAULTS, type AiProviderChoice } from './workspaceConfig';
import { logger } from '../observability';

/**
 * Canlı model kataloğu.
 * ---------------------------------------------------------------------------
 * Anahtar girildiğinde sağlayıcının resmî `/models` uç noktasından GÜNCEL
 * model listesi çekilir; böylece kullanıcı her zaman son sürümlere kadar
 * seçim yapabilir. Ağ hatası/erişim yoksa derlenik (built-in) güncel listeye
 * düşülür ve bu durum arayüze dürüstçe bildirilir.
 */

export interface ModelCatalogResult {
  source: 'live' | 'builtin';
  models: string[];
  note?: string;
}

const EXCLUDE_PATTERNS = /embedding|tts|whisper|dall|audio|realtime|image|transcri|rerank|search|computer-use|moderation|deep-research/i;

function sortCatalog(ids: string[], provider: AiProviderChoice): string[] {
  const curated = AI_PROVIDER_DEFAULTS[provider as Exclude<AiProviderChoice, 'deterministic'>]?.models ?? [];
  const curatedSet = new Set(curated);
  const head = curated.filter((m) => ids.includes(m));
  const rest = ids.filter((m) => !curatedSet.has(m));
  return [...head, ...rest].slice(0, 80);
}

async function fetchJson(url: string, headers: Record<string, string>, timeoutMs = 10_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI ve Gemini (OpenAI uyumlu) `/models` yanıtını normalleştirir. */
function parseOpenAiStyleModels(raw: unknown, provider: AiProviderChoice): string[] {
  const data = (raw as { data?: { id?: string }[] })?.data;
  if (!Array.isArray(data)) return [];
  const prefix = provider === 'gemini' ? /^gemini-/ : /^(gpt-|o\d|chatgpt-)/;
  return data
    .map((m) => m?.id ?? '')
    .filter((id) => id && prefix.test(id) && !EXCLUDE_PATTERNS.test(id));
}

async function openAiModels(key: string, baseUrl: string): Promise<string[]> {
  const raw = await fetchJson(`${baseUrl}/models`, { Authorization: `Bearer ${key}` });
  return parseOpenAiStyleModels(raw, 'openai');
}

async function geminiModels(key: string, baseUrl: string): Promise<string[]> {
  const raw = await fetchJson(`${baseUrl}/models`, { Authorization: `Bearer ${key}` });
  return parseOpenAiStyleModels(raw, 'gemini');
}

async function anthropicModels(key: string, baseUrl: string): Promise<string[]> {
  const raw = await fetchJson(`${baseUrl}/models?limit=100`, {
    'x-api-key': key,
    'anthropic-version': '2023-06-01'
  });
  const data = (raw as { data?: { id?: string }[] })?.data;
  if (!Array.isArray(data)) return [];
  return data.map((m) => m?.id ?? '').filter((id) => id.startsWith('claude-'));
}

/**
 * Sağlayıcının canlı model listesini getirir.
 * Başarısızlıkta derlenik güncel liste döner (source: 'builtin').
 */
export async function fetchModelCatalog(
  provider: AiProviderChoice,
  cfg: { key: string | null; baseUrl: string | null }
): Promise<ModelCatalogResult> {
  if (provider === 'deterministic') return { source: 'builtin', models: [] };

  const defaults = AI_PROVIDER_DEFAULTS[provider];
  const builtin = { source: 'builtin' as const, models: [...defaults.models] };

  if (!cfg.key) {
    return {
      ...builtin,
      note: 'Canlı liste için önce API anahtarı girin; şimdilik bilinen güncel modeller gösteriliyor.'
    };
  }

  try {
    const baseUrl = (cfg.baseUrl || defaults.baseUrl).replace(/\/+$/, '');
    let ids: string[] = [];
    if (provider === 'openai') ids = await openAiModels(cfg.key, baseUrl);
    else if (provider === 'gemini') ids = await geminiModels(cfg.key, baseUrl);
    else if (provider === 'anthropic') ids = await anthropicModels(cfg.key, baseUrl);

    if (!ids.length) {
      return { ...builtin, note: 'Sağlayıcı model listesi döndürmedi; bilinen güncel modeller gösteriliyor.' };
    }
    return { source: 'live', models: sortCatalog(ids, provider) };
  } catch (error) {
    logger.warn({
      event: 'ai.model_catalog_failed',
      provider,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return {
      ...builtin,
      note: 'Sağlayıcının model listesine ulaşılamadı (ağ hatası veya geçersiz anahtar). Bilinen güncel modeller gösteriliyor; isterseniz model kimliğini elle de yazabilirsiniz.'
    };
  }
}
