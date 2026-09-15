/**
 * REST API Tabanlı E-posta Sağlayıcıları (§107)
 * (Resend, SendGrid, Generic HTTP API)
 */

import type { EmailProvider, EmailMessage, SendEmailResult } from './types';

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  private apiKey: string;
  private defaultFrom: string;

  constructor(apiKey: string, defaultFrom = 'SocialFlow AI <noreply@socialflow.ai>') {
    this.apiKey = apiKey;
    this.defaultFrom = defaultFrom;
  }

  async send(message: EmailMessage): Promise<SendEmailResult> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: message.from || this.defaultFrom,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
          reply_to: message.replyTo
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          provider: this.name,
          error: data?.message || `HTTP ${res.status}`
        };
      }

      return {
        success: true,
        provider: this.name,
        messageId: data?.id
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        error: err?.message || 'Resend API çağrısı başarısız'
      };
    }
  }
}

export class SendGridEmailProvider implements EmailProvider {
  readonly name = 'sendgrid';
  private apiKey: string;
  private defaultFrom: string;

  constructor(apiKey: string, defaultFrom = 'SocialFlow AI <noreply@socialflow.ai>') {
    this.apiKey = apiKey;
    this.defaultFrom = defaultFrom;
  }

  async send(message: EmailMessage): Promise<SendEmailResult> {
    try {
      const fromEmail = (message.from || this.defaultFrom).replace(/.*<([^>]+)>.*/, '$1').trim();
      const fromName = (message.from || this.defaultFrom).replace(/<[^>]+>/, '').trim() || 'SocialFlow AI';

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from: { email: fromEmail, name: fromName },
          subject: message.subject,
          content: [
            { type: 'text/plain', value: message.text },
            ...(message.html ? [{ type: 'text/html', value: message.html }] : [])
          ]
        })
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return {
          success: false,
          provider: this.name,
          error: `HTTP ${res.status}: ${text}`
        };
      }

      const messageId = res.headers.get('x-message-id') || undefined;
      return {
        success: true,
        provider: this.name,
        messageId
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        error: err?.message || 'SendGrid API çağrısı başarısız'
      };
    }
  }
}
