import fs from 'fs/promises';
import path from 'path';
import { env } from '../env';
import { AppError } from '../errors';
import { EMPTY_SHA256, presignV4, sha256Hex, signV4 } from './sigv4';

/**
 * Depolama soyutlaması (Storage Driver)
 * ---------------------------------------------------------------------------
 * Demo/geliştirme: yerel dosya sistemi (`./storage`).
 * Üretim: S3 uyumlu nesne deposu. `STORAGE_DRIVER=s3` yapıldığında
 * S3Storage devreye girer; uygulama kodunun geri kalanı değişmez.
 */

export interface StoredObject {
  storageKey: string;
  publicUrl: string;
  bytes: number;
  mimeType: string;
}

export interface StorageDriver {
  name: string;
  put(key: string, data: Buffer | Uint8Array, mimeType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  url(key: string): string;
  exists(key: string): Promise<boolean>;
}

function safeKey(key: string): string {
  return key.replace(/^\/+/, '').replace(/\.\./g, '_').replace(/[^a-zA-Z0-9._\-\/]/g, '_');
}

class LocalStorage implements StorageDriver {
  name = 'local';
  private root: string;

  constructor() {
    this.root = path.resolve(process.cwd(), env.storageLocalDir || './storage');
  }

  private abs(key: string) {
    return path.join(this.root, safeKey(key));
  }

  async put(key: string, data: Buffer | Uint8Array, mimeType: string): Promise<StoredObject> {
    const file = this.abs(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const buf = Buffer.from(data);
    await fs.writeFile(file, buf);
    return { storageKey: key, publicUrl: this.url(key), bytes: buf.length, mimeType };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.abs(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.abs(key), { force: true });
  }

  url(key: string): string {
    return `/api/v1/media/file/${safeKey(key)}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.abs(key));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * S3 uyumlu nesne deposu (AWS, MinIO, R2, B2, Wasabi …).
 * SigV4 imzası `./sigv4` içinde bağımlılıksız üretilir; gizli anahtarlar
 * yalnızca sunucuda kalır, tarayıcıya yalnızca ön imzalı URL gider (§16).
 */
class S3Storage implements StorageDriver {
  name = 's3';
  private endpoint: string | null;
  private bucket: string;
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private forcePathStyle: boolean;

  constructor() {
    const cfg = env.s3;
    if (!cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey) {
      throw new Error(
        'S3 depolama yapılandırması eksik. S3_BUCKET, S3_ACCESS_KEY_ID ve S3_SECRET_ACCESS_KEY değişkenlerini tanımlayın (yerel sürücü için STORAGE_DRIVER=local).'
      );
    }
    this.endpoint = cfg.endpoint ? cfg.endpoint.replace(/\/$/, '') : null;
    this.bucket = cfg.bucket;
    this.region = cfg.region || 'us-east-1';
    this.accessKeyId = cfg.accessKeyId;
    this.secretAccessKey = cfg.secretAccessKey;
    this.forcePathStyle = cfg.forcePathStyle !== false;
  }

  /** İstek hedefi: sanal host (AWS) veya yol tabanlı (MinIO/R2). */
  private target(key?: string) {
    const safe = key ? safeKey(key) : '';
    if (!this.endpoint) {
      const host = `${this.bucket}.s3.${this.region}.amazonaws.com`;
      return { url: `https://${host}/${safe}`, host, path: `/${safe}` };
    }
    const base = new URL(this.endpoint);
    const host = this.forcePathStyle ? base.host : `${this.bucket}.${base.host}`;
    const prefix = this.forcePathStyle ? `/${this.bucket}` : '';
    return { url: `${base.protocol}//${host}${prefix}/${safe}`, host, path: `${prefix}/${safe}` };
  }

  private amzDate() {
    return new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private async request(method: string, key: string | undefined, body?: Buffer, mimeType?: string) {
    const { url, host, path } = this.target(key);
    const payloadHash = body ? sha256Hex(body) : EMPTY_SHA256;
    const headers: Record<string, string> = body && mimeType ? { 'content-type': mimeType } : {};
    const signed = signV4({
      method,
      host,
      path,
      headers,
      payloadHash,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      amzDate: this.amzDate()
    });
    return fetch(url, {
      method,
      headers: {
        ...headers,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': signed.stringToSign.split('\n')[1],
        authorization: signed.authorization
      },
      body: body ? new Uint8Array(body) : undefined,
      cache: 'no-store'
    });
  }

  async put(key: string, data: Buffer | Uint8Array, mimeType: string): Promise<StoredObject> {
    const buf = Buffer.from(data);
    const res = await this.request('PUT', key, buf, mimeType);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new AppError('STORAGE_ERROR', 'Medya nesne deposuna yüklenemedi.', {
        status: 502,
        details: { status: res.status, detail: detail.slice(0, 200) },
        recoverable: true
      });
    }
    return { storageKey: key, publicUrl: this.url(key), bytes: buf.length, mimeType };
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.request('GET', key);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new AppError('STORAGE_ERROR', 'Medya nesne deposundan okunamadı.', {
        status: 502,
        details: { status: res.status },
        recoverable: true
      });
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const res = await this.request('DELETE', key);
    if (!res.ok && res.status !== 404) {
      throw new AppError('STORAGE_ERROR', 'Medya nesne deposundan silinemedi.', {
        status: 502,
        details: { status: res.status },
        recoverable: true
      });
    }
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.request('HEAD', key);
    return res.ok;
  }

  /** Tarayıcıya verilen adres: ön imzalı, süreli (kimlik bilgisi içermez). */
  url(key: string): string {
    const { host, path } = this.target(key);
    return presignV4({
      host,
      path,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      amzDate: this.amzDate()
    });
  }
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  driver = env.storageDriver === 's3' ? new S3Storage() : new LocalStorage();
  return driver;
}

/** Yerel sürücü için dosya sisteminden doğrudan okuma (stream endpoint'i). */
export async function readLocal(key: string): Promise<{ data: Buffer; root: string } | null> {
  const root = path.resolve(process.cwd(), env.storageLocalDir || './storage');
  const file = path.join(root, safeKey(key));
  if (!file.startsWith(root)) return null; // path traversal koruması
  try {
    const data = await fs.readFile(file);
    return { data, root };
  } catch {
    return null;
  }
}

export function localRoot(): string {
  return path.resolve(process.cwd(), env.storageLocalDir || './storage');
}

export function makeStorageKey(workspaceId: string, folder: string, filename: string): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `${workspaceId}/${folder}/${stamp}/${safeKey(filename)}`;
}
