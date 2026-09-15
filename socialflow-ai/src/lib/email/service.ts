/**
 * Merkezi E-posta Servisi (§107)
 * ---------------------------------------------------------------------------
 * E-posta sağlayıcı soyutlaması: SMTP, Resend, SendGrid, Konsol veya Bellek.
 * Şifre sıfırlama, bildirimler ve sistem e-postalarını yönetir.
 */

import { env } from '../env';
import type { EmailProvider, EmailMessage, SendEmailResult } from './types';
import { SmtpEmailProvider } from './smtpProvider';
import { ResendEmailProvider, SendGridEmailProvider } from './apiProvider';
import { ConsoleEmailProvider, MemoryEmailProvider } from './memoryProvider';

export class EmailService {
  private provider: EmailProvider;
  private defaultFrom: string;

  constructor(provider?: EmailProvider) {
    this.defaultFrom = process.env.EMAIL_FROM || 'SocialFlow AI <noreply@socialflow.ai>';
    this.provider = provider || this.resolveProvider();
  }

  setProvider(provider: EmailProvider) {
    this.provider = provider;
  }

  getProvider(): EmailProvider {
    return this.provider;
  }

  private resolveProvider(): EmailProvider {
    const configuredType = (process.env.EMAIL_PROVIDER || '').toLowerCase().trim();

    if (configuredType === 'memory') {
      return new MemoryEmailProvider();
    }
    if (configuredType === 'console') {
      return new ConsoleEmailProvider();
    }

    // SMTP yapılandırılmışsa
    const smtpHost = process.env.SMTP_HOST;
    if (configuredType === 'smtp' || (smtpHost && !configuredType)) {
      return new SmtpEmailProvider({
        host: smtpHost || 'localhost',
        port: Number(process.env.SMTP_PORT) || 587,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
        from: this.defaultFrom,
        timeoutMs: Number(process.env.SMTP_TIMEOUT_MS) || 15_000
      });
    }

    // Resend yapılandırılmışsa
    const resendKey = process.env.RESEND_API_KEY;
    if (configuredType === 'resend' || (resendKey && !configuredType)) {
      return new ResendEmailProvider(resendKey || '', this.defaultFrom);
    }

    // SendGrid yapılandırılmışsa
    const sendgridKey = process.env.SENDGRID_API_KEY;
    if (configuredType === 'sendgrid' || (sendgridKey && !configuredType)) {
      return new SendGridEmailProvider(sendgridKey || '', this.defaultFrom);
    }

    // Varsayılan: Konsol sağlayıcısı
    return new ConsoleEmailProvider();
  }

  async sendEmail(message: EmailMessage): Promise<SendEmailResult> {
    const msg: EmailMessage = {
      ...message,
      from: message.from || this.defaultFrom
    };
    return this.provider.send(msg);
  }

  /**
   * Şifre sıfırlama e-postası şablonu (§107).
   */
  async sendPasswordResetEmail(params: {
    to: string;
    resetUrl: string;
    userName?: string;
  }): Promise<SendEmailResult> {
    const name = params.userName ? params.userName : 'Kullanıcı';
    const subject = 'SocialFlow AI — Şifre Sıfırlama Bağlantısı';

    const text = `Merhaba ${name},

SocialFlow AI hesabınız için bir şifre sıfırlama talebinde bulunuldu.
Şifrenizi sıfırlamak için aşağıdaki bağlantıyı kullanabilirsiniz:

${params.resetUrl}

Bu bağlantı güvenlik sebebiyle 30 dakika süreyle geçerlidir.
Eğer bu talebi siz yapmadıysanız lütfen bu e-postayı dikkate almayın; şifreniz değişmeyecektir.

Saygılarımızla,
SocialFlow AI Ekibi`;

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { margin-bottom: 24px; text-align: center; }
    .logo { font-size: 22px; font-weight: 700; color: #6d28d9; }
    .button { display: inline-block; padding: 12px 28px; background-color: #6d28d9; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 24px 0; }
    .footer { margin-top: 32px; font-size: 13px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 16px; }
    .note { background-color: #f8fafc; border-left: 4px solid #6d28d9; padding: 12px; font-size: 13px; color: #475569; margin: 16px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">SocialFlow AI</div>
    </div>
    <p>Merhaba <strong>${escapeHtml(name)}</strong>,</p>
    <p>Hesabınız için bir şifre sıfırlama talebinde bulundunuz. Yeni bir şifre belirlemek için aşağıdaki butona tıklayın:</p>
    <div style="text-align: center;">
      <a href="${escapeHtml(params.resetUrl)}" class="button">Şifremi Sıfırla</a>
    </div>
    <div class="note">
      Bu bağlantı <strong>30 dakika</strong> boyunca geçerlidir. Talebi siz yapmadıysanız bu mesajı görmezden gelebilirsiniz.
    </div>
    <p style="font-size: 13px; color: #64748b; word-break: break-all;">
      Buton çalışmıyorsa şu bağlantıyı tarayıcınıza yapıştırın:<br>
      <a href="${escapeHtml(params.resetUrl)}" style="color: #6d28d9;">${escapeHtml(params.resetUrl)}</a>
    </p>
    <div class="footer">
      SocialFlow AI — Sosyal Medya Yönetim Platformu
    </div>
  </div>
</body>
</html>`;

    return this.sendEmail({
      to: params.to,
      subject,
      text,
      html
    });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const emailService = new EmailService();
