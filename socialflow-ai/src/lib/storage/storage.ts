import fs from 'fs/promises';
import path from 'path';
import { env } from '../env';

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
    return `/api/media/file/${safeKey(key)}`;
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
 * S3 sürücüsü — iskelet. Üretimde `@aws-sdk/client-s3` ve
 * `@aws-sdk/s3-request-presigner` eklenerek aktif edilir.
 * Arayüz LocalStorage ile aynıdır, böylece geçiş şeffaftır.
 */
class S3Storage implements StorageDriver {
  name = 's3';

  private ensureClient(): never {
    throw new Error(
      'S3 depolama sürücüsü yapılandırılmamış. `@aws-sdk/client-s3` paketini ekleyip STORAGE_DRIVER=s3 ve S3_* ortam değişkenlerini tanımlayın. Yerel sürücüye dönmek için STORAGE_DRIVER=local kullanın.'
    );
  }

  async put(): Promise<StoredObject> {
    return this.ensureClient();
  }
  async get(): Promise<Buffer | null> {
    return this.ensureClient();
  }
  async delete(): Promise<void> {
    return this.ensureClient();
  }
  url(key: string): string {
    const { endpoint, bucket, region } = env.s3;
    if (endpoint) return `${endpoint.replace(/\/$/, '')}/${bucket}/${safeKey(key)}`;
    return `https://${bucket}.s3.${region}.amazonaws.com/${safeKey(key)}`;
  }
  async exists(): Promise<boolean> {
    return this.ensureClient();
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
