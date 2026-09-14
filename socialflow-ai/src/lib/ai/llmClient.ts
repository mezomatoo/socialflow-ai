import { env } from '../env';

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

export function activeProvider(): AiProvider {
  const configured = env.ai.provider;
  if (configured === 'openai' && env.ai.openaiKey) return 'openai';
  if (configured === 'anthropic' && env.ai.anthropicKey) return 'anthropic';
  return 'deterministic';
}

export function aiModeLabel(): string {
  switch (activeProvider()) {
    case 'openai':
      return `OpenAI (${env.ai.openaiModel})`;
    case 'anthropic':
      return `Anthropic (${env.ai.anthropicModel})`;
    default:
      return 'Yerel Motor (Demo)';
  }
}

/**
 * Yapılandırılmış JSON çıktısı ister. LLM erişimi yoksa `null` döner ve
 * çağıran servis yerel (deterministic) motora düşer.
 */
export async function completeJson<T>(req: LlmRequest): Promise<{ data: T | null; result: LlmResult }> {
  const started = Date.now();
  const provider = activeProvider();

  if (provider === 'deterministic') {
    return {
      data: null,
      result: { text: '', provider, model: null, degraded: true, ms: Date.now() - started }
    };
  }

  try {
    const text = provider === 'openai' ? await callOpenAi(req) : await callAnthropic(req);
    const parsed = parseJsonLoose<T>(text);
    return {
      data: parsed,
      result: {
        text,
        provider,
        model: provider === 'openai' ? env.ai.openaiModel : env.ai.anthropicModel,
        degraded: parsed === null,
        ms: Date.now() - started
      }
    };
  } catch (err) {
    console.error(`[ai:${req.task}] sağlayıcı çağrısı başarısız, yerel motora düşülüyor`, err);
    return {
      data: null,
      result: {
        text: '',
        provider: 'deterministic',
        model: null,
        degraded: true,
        ms: Date.now() - started
      }
    };
  }
}

async function callOpenAi(req: LlmRequest): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.ai.openaiKey}`
    },
    body: JSON.stringify({
      model: env.ai.openaiModel,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user }
      ]
    })
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return json?.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(req: LlmRequest): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ai.anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: env.ai.anthropicModel,
      max_tokens: req.maxTokens ?? 1200,
      temperature: req.temperature ?? 0.7,
      system: req.system,
      messages: [{ role: 'user', content: req.user }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return json?.content?.[0]?.text ?? '';
}

/** Model metin içine ```json sarabilir; hoşgörülü ayrıştırma. */
export function parseJsonLoose<T>(text: string): T | null {
  if (!text) return null;
  const direct = tryParse<T>(text);
  if (direct) return direct;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const v = tryParse<T>(fenced[1]);
    if (v) return v;
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const v = tryParse<T>(text.slice(start, end + 1));
    if (v) return v;
  }
  return null;
}

function tryParse<T>(s: string): T | null {
  try {
    const v = JSON.parse(s.trim());
    return (v && typeof v === 'object' ? v : null) as T | null;
  } catch {
    return null;
  }
}

/**
 * AI GÜVENLİĞİ — marka içeriği için sistem talimatı.
 * Tüm üretim servisleri bu ortak bloğu kullanır.
 */
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
