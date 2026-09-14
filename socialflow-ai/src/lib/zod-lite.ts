/**
 * zod-lite — minimal, bağımlılıksız şema doğrulama.
 * Amaç: API girdilerini Türkçe hata mesajlarıyla doğrulamak.
 * Üretimde `zod` paketine geçmek isterseniz bu dosyayı değiştirmeniz yeterli;
 * kullanım arayüzü aynıdır.
 */

export class ZodError extends Error {
  issues: { path: string; message: string }[];
  constructor(issues: { path: string; message: string }[]) {
    super(issues[0]?.message ?? 'Doğrulama hatası');
    this.name = 'ZodError';
    this.issues = issues;
  }
}

export type Shape = Record<string, FieldDef>;

export interface FieldDef {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
  required?: boolean;
  min?: number;
  max?: number;
  enum?: readonly string[];
  default?: unknown;
  message?: string;
}

const f = {
  string: (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'string', required: true, ...opts }),
  optionalString: (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'string', required: false, ...opts }),
  number: (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'number', required: true, ...opts }),
  optionalNumber: (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'number', required: false, ...opts }),
  boolean: (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'boolean', required: false, ...opts }),
  array: (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'array', required: true, ...opts }),
  any: (opts: Partial<FieldDef> = {}): FieldDef => ({ type: 'any', required: false, ...opts })
};

export function validate<T = Record<string, unknown>>(input: unknown, shape: Shape): T {
  const issues: { path: string; message: string }[] = [];
  const out: Record<string, unknown> = {};
  const src = (input ?? {}) as Record<string, unknown>;

  for (const [key, def] of Object.entries(shape)) {
    const raw = src[key];
    const label = def.message ?? key;

    if (raw === undefined || raw === null || raw === '') {
      if (def.required && def.default === undefined) {
        issues.push({ path: key, message: `${label} zorunludur.` });
        continue;
      }
      if (def.default !== undefined) out[key] = def.default;
      else if (raw === null) out[key] = null;
      continue;
    }

    switch (def.type) {
      case 'string': {
        const v = String(raw);
        if (def.min !== undefined && v.length < def.min) {
          issues.push({ path: key, message: `${label} en az ${def.min} karakter olmalıdır.` });
          continue;
        }
        if (def.max !== undefined && v.length > def.max) {
          issues.push({ path: key, message: `${label} en fazla ${def.max} karakter olmalıdır.` });
          continue;
        }
        if (def.enum && !def.enum.includes(v)) {
          issues.push({ path: key, message: `${label} için geçersiz değer.` });
          continue;
        }
        out[key] = v;
        break;
      }
      case 'number': {
        const v = Number(raw);
        if (!Number.isFinite(v)) {
          issues.push({ path: key, message: `${label} sayısal olmalıdır.` });
          continue;
        }
        if (def.min !== undefined && v < def.min) {
          issues.push({ path: key, message: `${label} en az ${def.min} olmalıdır.` });
          continue;
        }
        if (def.max !== undefined && v > def.max) {
          issues.push({ path: key, message: `${label} en fazla ${def.max} olmalıdır.` });
          continue;
        }
        out[key] = v;
        break;
      }
      case 'boolean':
        out[key] = raw === true || raw === 'true' || raw === 1;
        break;
      case 'array': {
        if (!Array.isArray(raw)) {
          issues.push({ path: key, message: `${label} bir liste olmalıdır.` });
          continue;
        }
        if (def.min !== undefined && raw.length < def.min) {
          issues.push({ path: key, message: `${label} en az ${def.min} öğe içermelidir.` });
          continue;
        }
        if (def.max !== undefined && raw.length > def.max) {
          issues.push({ path: key, message: `${label} en fazla ${def.max} öğe içerebilir.` });
          continue;
        }
        out[key] = raw;
        break;
      }
      default:
        out[key] = raw;
    }
  }

  if (issues.length) throw new ZodError(issues);
  return out as T;
}

export { f };
