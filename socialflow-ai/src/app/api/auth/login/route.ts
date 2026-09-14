import { apiRoute, badRequest } from '@/lib/api';
import { verifyPassword } from '@/lib/crypto';
import { issueSession, setSessionCookies, clientIp, userAgent } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { f, validate } from '@/lib/zod-lite';
import { ensureRules } from '@/lib/rules/ruleEngine';

export const POST = apiRoute(
  async (request) => {
    const body = await request.json().catch(() => ({}));
    const data = validate<{ email: string; password: string }>(body, {
      email: f.string({ message: 'E-posta' }),
      password: f.string({ message: 'Şifre' })
    });

    const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase().trim() } });
    if (!user || !user.isActive || !verifyPassword(data.password, user.passwordHash)) {
      return badRequest('E-posta veya şifre hatalı. Lütfen bilgilerinizi kontrol edin.');
    }

    const { raw, csrf } = await issueSession(user.id, clientIp(request), userAgent(request));
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await ensureRules(user.workspaceId).catch(() => undefined);

    await audit({
      workspaceId: user.workspaceId,
      userId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      request
    });

    const res = NextResponse.json({
      ok: true,
      data: { id: user.id, name: user.name, email: user.email, role: user.role, workspaceId: user.workspaceId }
    });
    return setSessionCookies(res, raw, csrf);
  },
  { csrf: false, auth: false, limit: 12, windowMs: 5 * 60_000 }
);
