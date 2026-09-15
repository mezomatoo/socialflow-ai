import crypto from 'crypto';

/**
 * AWS Signature Version 4 (S3) — bağımlılıksız imzalama.
 * ---------------------------------------------------------------------------
 * Neden kendi imzamız? Faz 1'de `@aws-sdk/client-s3` gibi ağır bir paket
 * eklemek istemedik; S3 uyumlu her sağlayıcı (AWS, MinIO, Cloudflare R2,
 * Backblaze B2, Wasabi …) aynı SigV4 imzasını bekler. Bu modül, gereken
 * kadarını (header imzası + ön imzalı URL) saf Node `crypto` ile üretir ve
 * AWS'nin resmî test vektörüyle doğrulanır (tests/phase1-storage.test.ts).
 */

export interface SigV4Input {
  method: string;
  /** İmzalanacak host (port dahil, ör. "s3.amazonaws.com"). */
  host: string;
  /** "/bucket/key" — kanonik kaynak yolu. */
  path: string;
  /** Sorgu parametreleri (sıralama imza içinde yapılır). */
  query?: Record<string, string>;
  /** Küçük harfli başlık adları; `host` ve `x-amz-date` otomatik eklenir. */
  headers?: Record<string, string>;
  /** Gövdenin SHA-256 (hex). Boş gövde için e3b0c442… kullanılır. */
  payloadHash?: string;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** ISO temel biçim: 20130524T000000Z */
  amzDate: string;
  /** İmza kapsamı için tarih (YYYYMMDD); verilmezse amzDate'ten türetilir. */
  dateStamp?: string;
}

export interface SigV4Result {
  authorization: string;
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
  signedHeaders: string;
  scope: string;
}

export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function sha256Hex(data: string | Buffer | Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function hmac(key: crypto.BinaryLike | crypto.KeyObject, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

/** RFC3986 kodlaması: alfanümerik ve -_.~ dışındakiler yüzde kodlanır. */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = '';
  for (const ch of value) {
    if (/[A-Za-z0-9\-_.~]/.test(ch)) out += ch;
    else if (ch === '/') out += encodeSlash ? '%2F' : '/';
    else out += Array.from(Buffer.from(ch, 'utf8'))
      .map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`)
      .join('');
  }
  return out;
}

function canonicalQueryString(query: Record<string, string> = {}): string {
  return Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k] ?? '')}`)
    .join('&');
}

function canonicalHeaders(headers: Record<string, string>): { canonical: string; signed: string } {
  const keys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonical = keys.map((k) => `${k}:${headers[k].trim().replace(/\s+/g, ' ')}\n`).join('');
  return { canonical, signed: keys.join(';') };
}

function signingKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/** Header tabanlı imza (Authorization başlığı üretir). */
export function signV4(input: SigV4Input): SigV4Result {
  const service = input.service ?? 's3';
  const payloadHash = input.payloadHash ?? EMPTY_SHA256;
  const dateStamp = input.dateStamp ?? input.amzDate.slice(0, 8);
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;

  const headers: Record<string, string> = {
    ...input.headers,
    host: input.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': input.amzDate
  };
  const { canonical, signed } = canonicalHeaders(headers);

  const canonicalRequest = [
    input.method.toUpperCase(),
    uriEncode(input.path, false).replace(/\/{2,}/g, '/'),
    canonicalQueryString(input.query),
    canonical,
    signed,
    payloadHash
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', input.amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(input.secretAccessKey, dateStamp, input.region, service), stringToSign).toString('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;

  return { authorization, canonicalRequest, stringToSign, signature, signedHeaders: signed, scope };
}

/** Ön imzalı (paylaşılabilir) URL — tarayıcıya kimlik bilgisi gitmez (§16). */
export function presignV4(
  input: Omit<SigV4Input, 'method' | 'payloadHash'> & { method?: string; expiresIn?: number }
): string {
  const method = input.method ?? 'GET';
  const service = input.service ?? 's3';
  const dateStamp = input.dateStamp ?? input.amzDate.slice(0, 8);
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const query: Record<string, string> = {
    ...(input.query ?? {}),
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${input.accessKeyId}/${scope}`,
    'X-Amz-Date': input.amzDate,
    'X-Amz-Expires': String(input.expiresIn ?? 3600),
    'X-Amz-SignedHeaders': 'host'
  };
  const canonicalRequest = [
    method.toUpperCase(),
    uriEncode(input.path, false).replace(/\/{2,}/g, '/'),
    canonicalQueryString(query),
    `host:${input.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', input.amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(input.secretAccessKey, dateStamp, input.region, service), stringToSign).toString('hex');
  return `https://${input.host}${uriEncode(input.path, false)}?${canonicalQueryString(query)}&X-Amz-Signature=${signature}`;
}
