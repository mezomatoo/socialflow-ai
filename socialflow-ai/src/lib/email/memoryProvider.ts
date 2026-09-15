/**
 * Bellek İçi ve Konsol E-posta Sağlayıcıları (Test ve Geliştirme İçin) (§107)
 */

import type { EmailProvider, EmailMessage, SendEmailResult } from './types';

export class MemoryEmailProvider implements EmailProvider {
  readonly name = 'memory';
  outbox: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<SendEmailResult> {
    this.outbox.push({ ...message });
    return {
      success: true,
      provider: this.name,
      messageId: `<mem-${Date.now()}-${this.outbox.length}@test.local>`
    };
  }

  clear() {
    this.outbox = [];
  }
}

export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<SendEmailResult> {
    console.info(`[email:console] Kime: ${message.to} | Konu: ${message.subject}`);
    console.info(`[email:console] İçerik: ${message.text.slice(0, 160)}...`);
    return {
      success: true,
      provider: this.name,
      messageId: `<console-${Date.now()}@dev.local>`
    };
  }
}
