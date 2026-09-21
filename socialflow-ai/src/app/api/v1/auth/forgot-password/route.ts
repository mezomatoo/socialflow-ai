import prisma from '@/lib/prisma';
import { apiRoute, ok } from '@/lib/api';
import { randomToken, sha256 } from '@/lib/crypto';
import { clientIp } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';
import { f, validate } from '@/lib/zod-lite';
import { env } from '@/lib/env';
import { emailService } from '@/lib/email/service';

/**
 * Şifre sıfırlama talebi (§12, §107)
 * ---------------------------------------------------------------------------
 * - Yanıt HER ZAMAN aynıdır: e-posta kayıtlı olsun ya da olmasın aynı mesaj
 *   döner (kullanıcı numaralandırma / enumeration saldırılarını engeller).
 * - Token'ın yalnızca SHA-256 özeti saklanır; ham token e-postayla gider.
 * - E-posta gönderimi soyutlanmış sağlayıcı (SMTP / Resend / SendGrid / Console / Memory)
 *   üzerinden yapılır (§107).
 * - devHint alanı KESİNLİKLE üretimde kapalıdır (yalnızca !isProduction iken dev/demo ortamında döner).
 */

const TOKEN_TTL_MINUTES = 30;
const NEUTRAL_MESSAGE =
  'Eğer bu e-posta ile bir hesap varsa, şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.';

export const POST = apiRoute(
  async (request) => {
    const body = await request.json().catch(() => ({}));
    const data = validate<{ email: string }>(body, { email: f.string({ message: 'E-posta', max: 200 }) });
    const email = data.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, workspaceId: true, isActive: true }
    });

    let devHint: string | undefined;

    if (user && user.isActive) {
      const rawToken = randomToken(32);
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(rawToken),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
          ip: clientIp(request)
        }
      });

      const link = `${env.appUrl}/sifremi-sifirla?token=${rawToken}`;

      // Gerçek e-posta sağlayıcısıyla gönderim (§107)
      try {
        await emailService.sendPasswordResetEmail({
          to: email,
          resetUrl: link,
          userName: user.name
        });
      } catch (sendErr) {
        // Hata kullanıcıya sızdırılmaz (kullanıcı numaralandırma ve hata sızıntısı engeli)
        console.error('[auth] Şifre sıfırlama e-postası gönderilemedi:', sendErr instanceof Error ? sendErr.message : String(sendErr));
      }

      // Güvenlik kuralı (§107): devHint KESİNLİKLE üretimde kapalıdır!
      if (!env.isProduction) {
        devHint = link;
        console.info(`[auth:dev] Şifre sıfırlama bağlantısı (${email}): ${link}`);
      }

      await audit({
        workspaceId: user.workspaceId,
        userId: user.id,
        action: 'auth.password_reset_requested',
        entityType: 'User',
        entityId: user.id,
        request
      });
    }

    return ok({ message: NEUTRAL_MESSAGE, devHint });
  },
  { csrf: false, auth: false, limit: 6, windowMs: 10 * 60_000 }
);
