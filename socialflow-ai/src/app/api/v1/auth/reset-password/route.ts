import prisma from '@/lib/prisma';
import { apiRoute, badRequest, ok } from '@/lib/api';
import { hashPassword, sha256 } from '@/lib/crypto';
import { audit } from '@/lib/security/audit';
import { f, validate } from '@/lib/zod-lite';

/**
 * Şifre sıfırlama (token ile) (§12)
 * ---------------------------------------------------------------------------
 * - Token tek kullanımlıktır ve süresi dolduğunda geçersizdir.
 * - Şifre değiştiğinde kullanıcının TÜM oturumları iptal edilir.
 */

const PASSWORD_MIN = 8;

export const POST = apiRoute(
  async (request) => {
    const body = await request.json().catch(() => ({}));
    const data = validate<{ token: string; password: string }>(body, {
      token: f.string({ message: 'Sıfırlama bağlantısı', min: 16 }),
      password: f.string({ message: 'Yeni şifre', min: PASSWORD_MIN, max: 200 })
    });

    if (data.password.length < PASSWORD_MIN) {
      return badRequest(`Şifre en az ${PASSWORD_MIN} karakter olmalıdır.`);
    }

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(data.token) },
      include: { user: { select: { id: true, workspaceId: true, isActive: true } } }
    });

    if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
      return badRequest('Sıfırlama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeni bir bağlantı isteyin.');
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(data.password) } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Şifre değişince tüm oturumlar geçersiz olur.
      prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    ]);

    await audit({
      workspaceId: record.user.workspaceId,
      userId: record.userId,
      action: 'auth.password_reset',
      entityType: 'User',
      entityId: record.userId,
      request
    });

    return ok({ message: 'Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.' });
  },
  { csrf: false, auth: false, limit: 10, windowMs: 10 * 60_000 }
);
