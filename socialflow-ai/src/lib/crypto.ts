import crypto from 'crypto';
import { env } from './env';

/**
 * Sağlayıcı token'ları için AES-256-GCM şifreleme.
 * Token'lar asla düz metin saklanmaz ve asla tarayıcıya gönderilmez.
 *
 * Biçim: v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>
 */

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = env.tokenEncryptionKey || env.sessionSecret;
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY veya SESSION_SECRET tanımlı değil.');
  // 32 baytlık deterministik türetme (HKDF benzeri) — herhangi bir uzunluktaki
  // gizli anahtardan güvenli bir AES anahtarı üretir.
  return crypto.createHash('sha256').update(String(raw)).digest();
}

export function encrypt(plaintext: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  return Buffer.from(packed, 'utf8');
}

export function decrypt(packed: Buffer | Uint8Array): string {
  const str = Buffer.from(packed).toString('utf8');
  const parts = str.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Şifreli token biçimi geçersiz.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Parola hash'i — scrypt (Node yerleşik, ek bağımlılık yok).
 * Üretimde argon2id önerilir; arayüz aynı kalacak şekilde soyutlanmıştır.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

/** Veritabanına yazılacak şifreli metin (base64). */
export function toCipherText(value: string): string {
  return encrypt(value).toString('base64');
}

/** Şifreli metni çözer. */
export function fromCipherText(value: unknown): string {
  if (!value) return '';
  if (value instanceof Uint8Array) return decrypt(value);
  if (Buffer.isBuffer(value)) return decrypt(value);
  const raw = String(value);
  // base64 olarak saklandıysa önce çöz
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && !raw.startsWith('v1:')) {
    return decrypt(Buffer.from(raw, 'base64'));
  }
  return decrypt(Buffer.from(raw, 'utf8'));
}

/** @deprecated fromCipherText kullanın */
export const fromBytes = fromCipherText;
/** @deprecated toCipherText kullanın */
export const toBytes = toCipherText;
