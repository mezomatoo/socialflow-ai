import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { apiRoute, badRequest } from '@/lib/api';
import { hashPassword } from '@/lib/crypto';
import { ensureMembership, issueSession, setSessionCookies, clientIp, userAgent } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';
import { ensureRules } from '@/lib/rules/ruleEngine';
import { f, validate } from '@/lib/zod-lite';

/**
 * Kayıt (§12)
 * ---------------------------------------------------------------------------
 * Her kullanıcı bir çalışma alanına (workspace) bağlıdır ve kayıt sırasında
 * otomatik olarak yeni bir çalışma alanı + OWNER üyeliği oluşturulur.
 * Kişisel/business veriler ASLA kullanıcıya doğrudan bağlanmaz (§14).
 */

const PASSWORD_MIN = 8;

function slugify(input: string) {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' };
  return input
    .replace(/[çğıöşüİ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

async function uniqueSlug(base: string) {
  const root = base || 'calisma-alani';
  let candidate = root;
  let i = 1;
  // Basit çakışma çözümü; eşzamanlı kayıtlarda benzersizlik DB kısıtıyla korunur.
  while (await prisma.workspace.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${root}-${i++}`;
    if (i > 200) throw new Error('slug');
  }
  return candidate;
}

export const POST = apiRoute(
  async (request) => {
    const body = await request.json().catch(() => ({}));
    const data = validate<{
      name: string;
      email: string;
      password: string;
      workspaceName?: string;
      kvkk?: boolean;
    }>(body, {
      name: f.string({ message: 'Ad soyad', min: 2, max: 120 }),
      email: f.string({ message: 'E-posta', max: 200 }),
      password: f.string({ message: 'Şifre', min: PASSWORD_MIN, max: 200 }),
      workspaceName: f.optionalString({ message: 'Çalışma alanı', max: 120 })
    });

    const email = data.email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return badRequest('Geçerli bir e-posta adresi girin.');
    }
    if (data.password.length < PASSWORD_MIN) {
      return badRequest(`Şifre en az ${PASSWORD_MIN} karakter olmalıdır.`);
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      // Güvenlik: e-posta varlığını kesin biçimde doğrulayan ayrı bir mesaj yerine
      // kayıt akışında açık ve yardımcı bir mesaj verilir (kayıt formu için standart).
      return badRequest('Bu e-posta adresi ile bir hesap zaten var. Giriş yapmayı deneyin.');
    }

    const workspaceName = (data.workspaceName || `${data.name} Çalışma Alanı`).trim();
    const slug = await uniqueSlug(slugify(workspaceName) || `ws-${Date.now().toString(36)}`);

    const result = await prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName,
          slug,
          plan: 'FREE',
          demoMode: false,
          appSettings: { create: {} }
        }
      });

      const user = await tx.user.create({
        data: {
          workspaceId: workspace.id,
          email,
          name: data.name.trim(),
          passwordHash: hashPassword(data.password),
          role: 'OWNER',
          emailVerifiedAt: null
        }
      });

      await tx.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER', status: 'ACTIVE' }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          action: 'workspace.created',
          entityType: 'Workspace',
          entityId: workspace.id,
          metadata: JSON.stringify({ via: 'register' })
        }
      });

      return { workspace, user };
    });

    // Yeni çalışma alanı için platform kuralları (kural motoru) hazırlanır.
    await ensureRules(result.workspace.id).catch(() => undefined);
    await ensureMembership({ workspaceId: result.workspace.id, userId: result.user.id, role: 'OWNER' });

    const { raw, csrf } = await issueSession(result.user.id, clientIp(request), userAgent(request));

    await audit({
      workspaceId: result.workspace.id,
      userId: result.user.id,
      action: 'auth.register',
      entityType: 'User',
      entityId: result.user.id,
      request
    });

    const res = NextResponse.json({
      ok: true,
      data: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        workspace: { id: result.workspace.id, name: result.workspace.name, slug: result.workspace.slug }
      }
    });
    return setSessionCookies(res, raw, csrf);
  },
  { csrf: false, auth: false, limit: 8, windowMs: 10 * 60_000 }
);
