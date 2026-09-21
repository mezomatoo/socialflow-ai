import { NextResponse } from 'next/server';
import { ZodError } from './zod-lite';
import { ForbiddenError, UnauthorizedError, verifyCsrf, getSession, clientIp, timingSafeEqualStr } from './auth/session';
import { rateLimit, rateLimitHeaders } from './security/rateLimit';
import { AppError } from './errors';
import { requestIdOf, reportError, logger } from './observability';
import { runWithAiWorkspace } from './ai/workspaceContext';

/**
 * Tüm API route'ları için ortak sarmalayıcı.
 * - CSRF doğrulaması (mutasyon istekleri)
 * - Hız sınırlama
 * - Tutarlı Türkçe hata gövdeleri
 * - Oturum çözümü
 */

export type Handler<Ctx = unknown> = (
  request: Request,
  ctx: { params: Ctx; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
) => Promise<Response> | Response;

export interface ErrorBody {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(code: string, message: string, status = 400, details?: unknown): NextResponse {
  const body: ErrorBody = { ok: false, error: { code, message, details } };
  return NextResponse.json(body, { status });
}

export function unauthorized(message = 'Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.') {
  return fail('UNAUTHORIZED', message, 401);
}

export function forbidden(message = 'Bu işlem için yetkiniz bulunmuyor.') {
  return fail('FORBIDDEN', message, 403);
}

export function badRequest(message: string, details?: unknown) {
  return fail('BAD_REQUEST', message, 400, details);
}

export function notFound(message = 'Kayıt bulunamadı.') {
  return fail('NOT_FOUND', message, 404);
}

export function serverError(message = 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.') {
  return fail('INTERNAL_ERROR', message, 500);
}

/**
 * Beklenmeyen hatalar için güvenli yanıt: iç ayrıntılar (Prisma/ORM mesajları,
 * yığın izleri) ASLA istemciye gönderilmez. Yanıt, istek kimliği ile loglanır.
 */
function internalErrorResponse(requestId: string) {
  const res = fail('INTERNAL_ERROR', 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.', 500);
  res.headers.set('X-Request-Id', requestId);
  return res;
}

interface RouteOptions {
  /** Opt-in session-bound CSRF for new inbox mutations; legacy routes unchanged. */
  sessionCsrf?: boolean;
  /** Mutasyonlarda CSRF doğrulaması (varsayılan: açık) */
  csrf?: boolean;
  /** Hız sınırı: pencere başına istek */
  limit?: number;
  windowMs?: number;
  /** Oturum zorunlu mu (varsayılan: true) */
  auth?: boolean;
}

export function apiRoute<Ctx = Record<string, string>>(handler: Handler<Ctx>, options: RouteOptions = {}) {
  const { sessionCsrf = false, csrf = true, limit = 180, windowMs = 60_000, auth = true } = options;

  return async (request: Request, routeCtx: { params: Ctx }): Promise<Response> => {
    const ip = clientIp(request);
    const pathname = new URL(request.url).pathname;
    const requestId = requestIdOf(request);
    const startedAt = Date.now();
    const rl = rateLimit(`${ip}:${pathname}`, limit, windowMs);
    if (!rl.ok) {
      return fail(
        'RATE_LIMITED',
        'Çok fazla istek gönderdiniz. Lütfen birkaç saniye bekleyip tekrar deneyin.',
        429
      );
    }

    try {
      if (csrf && !verifyCsrf(request)) {
        return fail('CSRF_FAILED', 'Güvenlik doğrulaması başarısız oldu. Sayfayı yenileyip tekrar deneyin.', 403);
      }

      let session: Awaited<ReturnType<typeof getSession>> = null;
      if (auth) {
        session = await getSession();
        if (!session) return unauthorized();
      }

      if (sessionCsrf && session && session.sessionId !== 'preview-demo' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) {
        const sent = request.headers.get('x-csrf-token') || '';
        if (!sent || !timingSafeEqualStr(sent, session.csrfToken)) {
          return fail('CSRF_FAILED', 'Güvenlik doğrulaması başarısız oldu. Sayfayı yenileyip tekrar deneyin.', 403);
        }
      }

      // Yapay zeka servislerinin çalışma alanına özgü sağlayıcı/anahtar
      // çözümleyebilmesi için istek bağlamı çalışma alanıyla sarılır.
      const response = await runWithAiWorkspace(session?.user.workspaceId ?? null, () =>
        handler(request, { params: routeCtx.params, session: session! })
      );
      Object.entries(rateLimitHeaders(rl)).forEach(([k, v]) => response.headers.set(k, v));
      response.headers.set('X-Request-Id', requestId);
      logger.info({
        event: 'api.request',
        requestId,
        method: request.method,
        path: pathname,
        status: response.status,
        durationMs: Date.now() - startedAt
      });
      return response;
    } catch (err) {
      if (err instanceof UnauthorizedError) return unauthorized(err.message);
      if (err instanceof ForbiddenError) return forbidden(err.message);
      if (err instanceof ZodError) return badRequest(err.issues[0]?.message ?? 'Geçersiz istek.', err.issues);
      if (err instanceof AppError) {
        reportError(err, { event: 'api.app_error', requestId, path: pathname, code: err.code });
        return fail(err.code, err.userMessage, err.status, err.details);
      }
      reportError(err, { event: 'api.unhandled_error', requestId, method: request.method, path: pathname });
      return internalErrorResponse(requestId);
    }
  };
}
