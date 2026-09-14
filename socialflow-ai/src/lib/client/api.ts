'use client';

/**
 * İstemci tarafı API yardımcısı.
 * CSRF token'ı HttpOnly olmayan `sf_csrf` çerezinden okunur ve mutasyon
 * isteklerinde başlık olarak gönderilir. Token'lar asla localStorage'a yazılmaz.
 */

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(message: string, code = 'ERROR', status = 400, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie('sf_csrf');
    if (csrf) headers.set('x-csrf-token', csrf);
  }

  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const text = await res.text();
  let json: ApiResponse<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as ApiResponse<T>) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.ok) {
    const message =
      json?.error?.message ??
      (res.status === 429
        ? 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyin.'
        : res.status === 401
          ? 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.'
          : 'İstek işlenemedi. Lütfen tekrar deneyin.');
    throw new ApiError(message, json?.error?.code ?? 'ERROR', res.status, json?.error?.details);
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', body: formData })
};

/** Küçük bir debounce yardımcısı (otomatik kaydetme için). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => {
    if (t) clearTimeout(t);
  };
  return wrapped;
}

/** İstek yarışlarını engellemek için sıra numarası. */
export function createRaceGuard() {
  let n = 0;
  return () => ++n;
}
