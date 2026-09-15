/**
 * PHASE 4 — Prompt Template Sistemi (§54-§55)
 * ------------------------------------------------
 * Prompt'lar UI bileşenlerine dağılmaz. Merkezi şablonlar VERİTABANINDA
 * (PromptTemplate modeli) sürümlenir; bu dosya yalnızca erişim katmanıdır.
 * - Kritik şablonların varsayılanları kodda TANIMLI olsa da tek doğruluk
 *   kaynağı DB'dir: DB'de aktif şablon varsa o kullanılır.
 * - DB okunamazsa (ör. AI izolasyonu, §106) kod içi varsayılana düşer; AI
 *   akışları kırılmaz.
 * - Yapılandırılmış çıktı JSON şeması ile doğrulanır (asla ham JSON'a güvenme).
 */
import prisma from '../prisma';
import { logger } from '../observability';

export interface PromptTemplate {
  id: string;
  name: string;
  service: string;
  version: string;
  systemPrompt: string;
  template: string;
  outputSchema: Record<string, unknown>;
  isActive: boolean;
  /** Kaynağın nereden geldiği (db | fallback) — teşhis için. */
  source: 'db' | 'fallback';
}

interface TemplateSeed {
  name: string;
  service: string;
  version: string;
  systemPrompt: string;
  template: string;
  outputSchema: Record<string, unknown>;
}

/**
 * Varsayılan şablon tohumları. Bunlar DB'ye seed edilir; DB'deki aktif sürüm
 * her zaman önceliklidir (sürümleme §54).
 */
export const DEFAULT_TEMPLATES: TemplateSeed[] = [
  {
    name: 'Caption Üretimi',
    service: 'captionGeneration',
    version: '1.0',
    systemPrompt: 'Sen SocialFlow AI için Türkçe içerik üreticisisin. Marka kiti tonuna sadık kal.',
    template: 'Marka: {{brandName}}\nTon: {{tone}}\nKonu: {{topic}}\nPlatform: {{platform}}\nCaption üret.',
    outputSchema: { type: 'object', properties: { caption: { type: 'string' } }, required: ['caption'] }
  },
  {
    name: 'Görsel Üretimi',
    service: 'imageGeneration',
    version: '1.0',
    systemPrompt: 'Sen premium marka görselleri üreten bir AI asistanısın. Marka kiti renklerini ve stilini koru.',
    template: 'Prompt: {{prompt}}\nMarka renkleri: {{palette}}\nStil: {{visualStyle}}\nÜrün: {{product}}',
    outputSchema: { type: 'object', properties: { prompt: { type: 'string' } } }
  },
  {
    name: 'İçerik Planlayıcı',
    service: 'contentPlanner',
    version: '1.0',
    systemPrompt: 'Aylık içerik takvimi planlayan stratejistsin. İçerik karmasını dengede tut. Fiattendırımları asla uydurma.',
    template: 'Marka: {{brand}}\nKampanya: {{campaign}}\nTarih aralığı: {{from}} - {{to}}\nPlatformlar: {{platforms}}',
    outputSchema: { type: 'object', properties: { items: { type: 'array' } } }
  }
];

function rowToTemplate(row: {
  id: string;
  name: string;
  service: string;
  version: string;
  systemPrompt: string;
  template: string;
  outputSchema: string;
  isActive: boolean;
}): PromptTemplate {
  let schema: Record<string, unknown> = {};
  try {
    schema = JSON.parse(row.outputSchema) as Record<string, unknown>;
  } catch {
    schema = {};
  }
  return { ...row, outputSchema: schema, source: 'db' };
}

function seedToTemplate(seed: TemplateSeed): PromptTemplate {
  return {
    id: `fallback:${seed.service}`,
    name: seed.name,
    service: seed.service,
    version: seed.version,
    systemPrompt: seed.systemPrompt,
    template: seed.template,
    outputSchema: seed.outputSchema,
    isActive: true,
    source: 'fallback'
  };
}

/** DB'deki aktif şablonu döner; yoksa veya DB hatasında kod içi varsayılana düşer. */
export async function getTemplate(service: string): Promise<PromptTemplate | null> {
  try {
    const row = await prisma.promptTemplate.findFirst({
      where: { service, isActive: true },
      orderBy: { updatedAt: 'desc' }
    });
    if (row) return rowToTemplate(row);
  } catch (error) {
    logger.warn({ event: 'ai.prompt_template_db_unavailable', errorMessage: error instanceof Error ? error.message : String(error) });
  }
  const seed = DEFAULT_TEMPLATES.find((t) => t.service === service);
  return seed ? seedToTemplate(seed) : null;
}

/** Tüm aktif şablonlar (yönetim/teşhis ekranları için). */
export async function listTemplates(): Promise<PromptTemplate[]> {
  try {
    const rows = await prisma.promptTemplate.findMany({ where: { isActive: true }, orderBy: [{ service: 'asc' }, { updatedAt: 'desc' }] });
    if (rows.length) return rows.map(rowToTemplate);
  } catch (error) {
    logger.warn({ event: 'ai.prompt_template_db_unavailable', errorMessage: error instanceof Error ? error.message : String(error) });
  }
  return DEFAULT_TEMPLATES.map(seedToTemplate);
}

/**
 * Varsayılan şablonları DB'ye idempotent olarak yükler (aynı service+version
 * varsa dokunmaz). Seed/İlk kurulum kullanımı içindir.
 */
export async function ensureDefaultTemplates(): Promise<void> {
  for (const seed of DEFAULT_TEMPLATES) {
    try {
      const existing = await prisma.promptTemplate.findFirst({
        where: { service: seed.service, version: seed.version }
      });
      if (!existing) {
        await prisma.promptTemplate.create({
          data: {
            name: seed.name,
            service: seed.service,
            version: seed.version,
            systemPrompt: seed.systemPrompt,
            template: seed.template,
            outputSchema: JSON.stringify(seed.outputSchema),
            isActive: true
          }
        });
      }
    } catch (error) {
      logger.warn({ event: 'ai.prompt_template_seed_failed', service: seed.service, errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v);
  return out;
}

export function validateOutput<T>(schema: Record<string, unknown>, data: unknown): T | null {
  // Minimal doğrulama: required alanlar var mı?
  if (!schema || typeof schema !== 'object') return data as T;
  const required = (schema as any).required as string[] | undefined;
  if (Array.isArray(required) && data && typeof data === 'object') {
    for (const k of required) if (!(k in (data as any))) return null;
  }
  return data as T;
}
