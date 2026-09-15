/**
 * PHASE 4 — Prompt Template Sistemi (§113-§114)
 * ------------------------------------------------
 * Prompt'lar UI bileşenlerine dağılmaz. Merkezi şablonlar üzerinden yönetilir.
 * - name, service, version, systemPrompt, template, outputSchema, isActive
 * - Yapılandırılmış çıktı JSON şema ile doğrulanır (asla ham JSON'a güvenme).
 */

export interface PromptTemplate {
  id: string;
  name: string;
  service: string;
  version: string;
  systemPrompt: string;
  template: string;
  outputSchema: Record<string, unknown>;
  isActive: boolean;
}

// Demo şablonlar — gerçekte DB'den (PromptTemplate modeli) gelir, burada mock.
const TEMPLATES: PromptTemplate[] = [
  {
    id: 'tpl-1',
    name: 'Caption Üretimi',
    service: 'captionGeneration',
    version: '1.0',
    systemPrompt: 'Sen SocialFlow AI için Türkçe içerik üreticisisin. Marka kiti tonuna sadık kal.',
    template: 'Marka: {{brandName}}\nTon: {{tone}}\nKonu: {{topic}}\nPlatform: {{platform}}\nCaption üret.',
    outputSchema: { type: 'object', properties: { caption: { type: 'string' } }, required: ['caption'] },
    isActive: true,
  },
  {
    id: 'tpl-img-1',
    name: 'Görsel Üretimi',
    service: 'imageGeneration',
    version: '1.0',
    systemPrompt: 'Sen premium marka görselleri üreten bir AI asistanısın. Marka kiti renklerini ve stilini koru.',
    template: 'Prompt: {{prompt}}\nMarka renkleri: {{palette}}\nStil: {{visualStyle}}\nÜrün: {{product}}',
    outputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
    isActive: true,
  },
  {
    id: 'tpl-plan-1',
    name: 'İçerik Planlayıcı',
    service: 'contentPlanner',
    version: '1.0',
    systemPrompt: 'Aylık içerik takvimi planlayan stratejistsin. İçerik karmasını dengede tut.',
    template: 'Marka: {{brand}}\nKampanya: {{campaign}}\nTarih aralığı: {{from}} - {{to}}\nPlatformlar: {{platforms}}',
    outputSchema: { type: 'object', properties: { items: { type: 'array' } } },
    isActive: true,
  },
];

export function getTemplate(service: string): PromptTemplate | null {
  return TEMPLATES.find((t) => t.service === service && t.isActive) ?? null;
}

export function listTemplates(): PromptTemplate[] {
  return TEMPLATES;
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
