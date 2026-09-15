import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import prisma from '../prisma';
import { env } from '../env';
import { randomToken, sha256 } from '../crypto';
import type { Role } from '../platforms/platforms';

/**
 * Oturum yönetimi
 * ---------------------------------------------------------------------------
 * - Tarayıcıda yalnızca HttpOnly + SameSite=Lax çerez içinde opak bir oturum
 *   kimliği tutulur. Token'lar localStorage'a YAZILMAZ.
 * - Oturum kaydı veritabanındadır; çerez değerinin SHA-256'sı saklanır, böylece
 *   veritabanı sızsa bile oturumlar ele geçirilemez.
 * - CSRF: ayrı bir token, HttpOnly olmayan `sf_csrf` çerezinde ve oturum
 *   kaydında tutulur; mutasyon yapan istekler `x-csrf-token` başlığıyla
 *   doğrulanır (double-submit + sunucu tarafı eşleştirme).
 */

export const SESSION_COOKIE = 'sf_session';
export const CSRF_COOKIE = 'sf_csrf';

const SESSION_TTL_DAYS = 14;
const isProd = process.env.APP_ENV === 'production';

/**
 * ÖNİZLEME OTURUMU (demo kolaylığı)
 * ---------------------------------------------------------------------------
 * Arena canlı önizlemesi uygulamayı, çerez saklamayan (opak/üçüncü-taraf) bir
 * iframe içinde ve `e2b-traffic-access-token` gerektiren bir proxy arkasında
 * sunar. Bu ortamda çerez tabanlı oturum çalışmaz; kullanıcı giriş yapsa bile
 * oturum çerezi geri gönderilmez.
 *
 * Bu yüzden YALNIZCA geliştirme + demo modunda (APP_ENV != production ve
 * DEMO_MODE açık), geçerli bir çerez oturumu yoksa demo kullanıcıya otomatik
 * oturum verilir. Üretimde (APP_ENV=production) bu davranış TAMAMEN kapalıdır;
 * normal çerez + CSRF + RBAC güvenliği aynen uygulanır.
 * `PREVIEW_AUTOLOGIN=false` ile geliştirme sırasında da kapatılabilir.
 */
const previewAuth = !isProd && env.demoMode && process.env.PREVIEW_AUTOLOGIN !== 'false';
const PREVIEW_DEMO_EMAIL = process.env.PREVIEW_DEMO_EMAIL || 'demo@socialflow.ai';

let demoSessionCache: SessionContext | null = null;

/** Demo kullanıcı için sentetik oturum (çerez gerektirmez). */
async function getPreviewDemoSession(): Promise<SessionContext | null> {
  if (demoSessionCache) return demoSessionCache;
  const user = await prisma.user.findFirst({
    where: { email: PREVIEW_DEMO_EMAIL, isActive: true },
    include: { workspace: { select: { id: true, name: true, slug: true, demoMode: true, timezone: true, locale: true } } }
  });
  if (!user) return null;
  demoSessionCache = {
    sessionId: 'preview-demo',
    csrfToken: 'preview-demo-csrf',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      membershipId: null,
      membershipStatus: 'ACTIVE',
      avatarUrl: user.avatarUrl,
      workspaceId: user.workspaceId,
      workspaceName: user.workspace.name,
      workspaceSlug: user.workspace.slug,
      demoMode: user.workspace.demoMode,
      timezone: user.workspace.timezone,
      locale: user.workspace.locale
    }
  };
  return demoSessionCache;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Çalışma alanı üyeliği (§14/15) — RBAC temeli. */
  membershipId: string | null;
  membershipStatus: string;
  avatarUrl: string | null;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  demoMode: boolean;
  timezone: string;
  locale: string;
}

export interface SessionContext {
  user: SessionUser;
  sessionId: string;
  csrfToken: string;
}

function cookieOptions(httpOnly: boolean) {
  // Canlı önizleme iki şekilde açılabilir:
  //  1) Arena içinde iframe (cross-site, opak origin) → tarayıcı çerezleri
  //     saklamayabilir; bu durumda önizleme AYRI SEKMEDE açılmalıdır.
  //  2) Ayrı sekmede top-level (first-party) → çerezler normal çalışır.
  // Her iki (HTTPS) bağlamda da çalışması için SameSite=None + Secure kullanılır.
  // `Partitioned` BİLEREK kullanılmaz: partitioned çerezler top-level sekmede
  // gönderilmez ve ayrı-sekme çözümünü bozardı.
  // Üretimde uygulama kendi origin'inde çalıştığından Lax yeterlidir.
  const crossSiteIframe = !isProd;
  return {
    httpOnly,
    sameSite: (crossSiteIframe ? 'none' : 'lax') as 'none' | 'lax',
    secure: true,
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60
  };
}

export async function createSession(userId: string, ip?: string, userAgent?: string) {
  const raw = randomToken(32);
  const csrf = randomToken(24);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      csrfToken: csrf,
      ip,
      userAgent,
      expiresAt
    }
  });

  const res = NextResponse.next();
  res.cookies.set(SESSION_COOKIE, raw, cookieOptions(true));
  // CSRF token'ının JS tarafından okunabilmesi gerekir (double-submit).
  res.cookies.set(CSRF_COOKIE, csrf, cookieOptions(false));
  return res;
}

export function setSessionCookies(res: NextResponse, raw: string, csrf: string) {
  res.cookies.set(SESSION_COOKIE, raw, cookieOptions(true));
  res.cookies.set(CSRF_COOKIE, csrf, cookieOptions(false));
  return res;
}

export async function issueSession(userId: string, ip?: string, userAgent?: string) {
  const raw = randomToken(32);
  const csrf = randomToken(24);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId, tokenHash: sha256(raw), csrfToken: csrf, ip, userAgent, expiresAt }
  });
  return { raw, csrf };
}

export async function destroySession() {
  const store = cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    await prisma.session
      .updateMany({ where: { tokenHash: sha256(raw) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  const res = NextResponse.next();
  res.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(true), maxAge: 0 });
  res.cookies.set(CSRF_COOKIE, '', { ...cookieOptions(false), maxAge: 0 });
  return res;
}

/** Geçerli oturumu çözer. Yoksa null. */
export async function getSession(): Promise<SessionContext | null> {
  const store = cookies();
  const raw = store.get(SESSION_COOKIE)?.value;

  if (raw) {
    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(raw) },
      include: {
        user: {
          include: {
            workspace: { select: { id: true, name: true, slug: true, demoMode: true, timezone: true, locale: true } },
            memberships: { select: { id: true, role: true, status: true } }
          }
        }
      }
    });

    if (session && !session.revokedAt && session.expiresAt >= new Date() && session.user?.isActive) {
      // Rol, çalışma alanı üyeliğinden gelir (yoksa kullanıcı kaydındaki role düşülür).
      const membership = session.user.memberships[0] ?? null;
      return {
        sessionId: session.id,
        csrfToken: session.csrfToken,
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: (membership?.role as Role) ?? (session.user.role as Role),
          membershipId: membership?.id ?? null,
          membershipStatus: membership?.status ?? 'ACTIVE',
          avatarUrl: session.user.avatarUrl,
          workspaceId: session.user.workspaceId,
          workspaceName: session.user.workspace.name,
          workspaceSlug: session.user.workspace.slug,
          demoMode: session.user.workspace.demoMode,
          timezone: session.user.workspace.timezone,
          locale: session.user.workspace.locale
        }
      };
    }
  }

  // Önizleme/demo: çerez oturumu yoksa demo kullanıcıya otomatik oturum.
  // (Yalnızca geliştirme + demo modu; üretimde kapalı.)
  if (previewAuth) return getPreviewDemoSession();

  return null;
}

/** Oturum yoksa 401 JSON döner. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export class UnauthorizedError extends Error {
  constructor(message = 'Oturum bulunamadı veya süresi doldu.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Bu işlem için yetkiniz yok.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

const ROLE_LEVEL: Record<Role, number> = {
  VIEWER: 0,
  CREATOR: 1,
  APPROVER: 2,
  EDITOR: 3,
  ADMIN: 4,
  OWNER: 5
};

export function hasRole(userRole: string, minimum: Role): boolean {
  return (ROLE_LEVEL[userRole as Role] ?? -1) >= (ROLE_LEVEL[minimum] ?? 99);
}

export function assertRole(session: SessionContext, minimum: Role) {
  if (!hasRole(session.user.role, minimum)) throw new ForbiddenError();
}

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

export function verifyCsrf(request: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return true;
  // Önizleme/demo modunda çerez saklanamadığı için CSRF double-submit çalışmaz;
  // bu modda CSRF doğrulaması atlanır (yalnızca dev + demoMode, üretimde kapalı).
  if (previewAuth) return true;
  const store = cookies();
  const expected = store.get(CSRF_COOKIE)?.value;
  const sent =
    request.headers.get('x-csrf-token') ||
    request.headers.get('x-xsrf-token') ||
    new URL(request.url).searchParams.get('csrf');
  if (!expected || !sent) return false;
  return timingSafeEqualStr(expected, sent);
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return a === b;
  }
}

export function clientIp(request?: Request): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  if (request) {
    const rf = request.headers.get('x-forwarded-for');
    if (rf) return rf.split(',')[0].trim();
  }
  return h.get('x-real-ip') || '0.0.0.0';
}

export function userAgent(request?: Request): string {
  return (request?.headers.get('user-agent') || headers().get('user-agent') || '').slice(0, 400);
}

// ---------------------------------------------------------------------------
// Çalışma alanı üyeliği (§14/15) — RBAC temeli
// ---------------------------------------------------------------------------

export const WORKSPACE_MEMBER_STATUSES = ['ACTIVE', 'INVITED', 'SUSPENDED'] as const;
export type WorkspaceMemberStatus = (typeof WORKSPACE_MEMBER_STATUSES)[number];

/** Çalışma alanı + kullanıcı için üyelik kaydını döner (yoksa null). */
export async function getMembership(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true, role: true, status: true, joinedAt: true }
  });
}

/**
 * Üyeliği garanti eder, yoksa oluşturur. Kayıt (register) akışı ve mevcut
 * verilerin taşınması (backfill) için kullanılır.
 */
export async function ensureMembership(params: {
  workspaceId: string;
  userId: string;
  role: Role;
  status?: WorkspaceMemberStatus;
}) {
  const existing = await getMembership(params.workspaceId, params.userId);
  if (existing) return existing;
  return prisma.workspaceMember.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      role: params.role,
      status: params.status ?? 'ACTIVE'
    },
    select: { id: true, role: true, status: true, joinedAt: true }
  });
}

/**
 * Oturumun belirli bir çalışma alanına erişimini doğrular.
 * Kiracı izolasyonu (§16) bu fonksiyon üzerinden sağlanır.
 */
export async function assertWorkspaceAccess(session: SessionContext, workspaceId: string, minimum?: Role) {
  if (session.user.workspaceId !== workspaceId) throw new ForbiddenError('Bu çalışma alanına erişiminiz yok.');
  const membership =
    (await getMembership(workspaceId, session.user.id)) ??
    (await ensureMembership({ workspaceId, userId: session.user.id, role: session.user.role }));
  if (membership.status !== 'ACTIVE') throw new ForbiddenError('Bu çalışma alanındaki üyeliğiniz etkin değil.');
  if (minimum && !hasRole(membership.role, minimum)) throw new ForbiddenError();
  return membership;
}
