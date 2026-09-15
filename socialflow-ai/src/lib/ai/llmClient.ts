import { env } from '../env';
import {
  aiModeLabel as modeLabel,
  activeProviderName,
  getAiAdapter,
  isExternalAiAvailable,
  parseJsonLoose,
  unavailableCapabilities
} from './provider';

export { parseJsonLoose };

/**
 * LLM istemci soyutlaması.
 * ---------------------------------------------------------------------------
 * Yapay zeka istemleri bileşenlerde DEĞİL, `src/lib/ai/*` servislerinde
 * tutulur. Sağlayıcılar arasında geçiş bu dosya üzerinden yapılır:
 *
 *   deterministic → yerel, harici çağrı yapmayan kural tabanlı motor (varsayılan)
 *   openai        → OpenAI Chat Completions (yapılandırılmış JSON çıktısı)
 *   anthropic     → Anthropic Messages API
 *
 * AI anahtarı tanımlı değilse sistem sessizce `deterministic` moda düşer;
 * arayüz her iki durumda da aynı çalışır.
 */

export type AiProvider = 'deterministic' | 'openai' | 'anthropic';

export interface LlmRequest {
  system: string;
  user: string;
  /** Beklenen JSON şeması (sağlayıcıya iletilir). */
  schema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  /** Kısa tanımlayıcı; loglama ve maliyet takibi için. */
  task: string;
}

export interface LlmResult {
  text: string;
  provider: AiProvider;
  model: string | null;
  degraded: boolean; // true → yerel motor kullanıldı
  ms: number;
}

/** Etkin sağlayıcı (adaptör kayıt defterinden). */
export function activeProvider(): AiProvider {
  return activeProviderName();
}

export function aiModeLabel(): string {
  return modeLabel();
}

/** Harici AI sağlayıcısı yapılandırılmış mı? */
export function externalAiAvailable(): boolean {
  return isExternalAiAvailable();
}

/** Phase 2+ için ayrılmış, şu an desteklenmeyen yetenekler. */
export function upcomingCapabilities() {
  return unavailableCapabilities();
}

/**
 * Yapılandırılmış JSON çıktısı ister (adaptör üzerinden).
 * LLM erişimi yoksa veya sağlayıcı hata verirse `data: null` döner ve çağıran
 * servis yerel (deterministik) motora düşer — AI hatası içerik üretimini
 * DURDURMAZ (§69). `result.failed` true ise sağlayıcı gerçekten denenmiş ve
 * başarısız olmuştur; arayüz bunu kullanıcıya bildirir.
 */
export async function completeJson<T>(req: LlmRequest): Promise<{ data: T | null; result: LlmResult }> {
  const adapter = getAiAdapter();
  const started = Date.now();

  if (adapter.name === 'deterministic') {
    return {
      data: null,
      result: { text: '', provider: 'deterministic', model: null, degraded: true, ms: Date.now() - started }
    };
  }

  const outcome = await adapter.structuredGeneration<Record<string, unknown>>(
    { system: req.system, user: req.user, schema: req.schema, temperature: req.temperature, maxTokens: req.maxTokens, task: req.task },
    (raw) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null)
  );

  if (outcome.data === null) {
    return {
      data: null,
      result: {
        text: outcome.text,
        provider: outcome.degraded ? 'deterministic' : outcome.provider,
        model: outcome.model,
        degraded: true,
        ms: outcome.durationMs
      }
    };
  }

  return {
    data: outcome.data as T,
    result: {
      text: outcome.text,
      provider: outcome.provider,
      model: outcome.model,
      degraded: false,
      ms: outcome.durationMs
    }
  };
}

export const AI_SAFETY_RULES = `
KESİN KURALLAR:
1. ASLA fiyat, indirim yüzdesi, kampanya tarihi, ürün özelliği, yasal veya tıbbi iddia, web sitesi adresi UYDURMA. Yalnızca kullanıcının verdiği veya marka profilinde bulunan bilgileri kullan.
2. Emin olmadığın bir bilgi gerekiyorsa ekleme; bunun yerine "[BİLGİ EKSİK: ...]" biçiminde işaretle.
3. Ürün adlarını, fiyatları, tarihleri, kampanya koşullarını, bağlantıları, zorunlu hashtagleri ve zorunlu mentionları AYNEN koru.
4. Metni asla karakter sınırından kesme. Anlamı koruyarak yeniden yaz.
5. Çıktı dili her zaman doğal, akıcı Türkçe olmalı. Makine çevirisi gibi durmamalı.
6. Türkçe yazım kurallarına uy: "de/da" bağlacı ayrı, "-de/-da" hâl eki bitişik; soru eki "mi" ayrı yazılır.
7. Yalnızca istenen JSON alanlarını döndür, açıklama ekleme.
`.trim();
