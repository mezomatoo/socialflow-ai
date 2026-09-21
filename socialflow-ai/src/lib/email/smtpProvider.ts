/**
 * Standart SMTP E-posta Sağlayıcısı (§107)
 * ---------------------------------------------------------------------------
 * Harici ağır bağımlılık gerektirmeksizin Node.js yerel net/tls soketleri
 * üzerinden RFC 5321/5322 uyumlu güvenli SMTP gönderimi yapar.
 */

import net from 'net';
import tls from 'tls';
import { randomBytes } from 'crypto';
import type { EmailProvider, EmailMessage, SendEmailResult, SmtpConfig } from './types';

export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private config: SmtpConfig;

  constructor(config: SmtpConfig) {
    this.config = config;
  }

  async send(message: EmailMessage): Promise<SendEmailResult> {
    const from = message.from || this.config.from;
    const to = message.to;
    const timeoutMs = this.config.timeoutMs || 15_000;
    const messageId = `<${Date.now()}.${randomBytes(8).toString('hex')}@${this.config.host || 'socialflow.ai'}>`;

    try {
      await this.deliverViaSmtp(from, to, message, messageId, timeoutMs);
      return {
        success: true,
        provider: this.name,
        messageId
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        error: err?.message || 'SMTP iletim hatası'
      };
    }
  }

  private deliverViaSmtp(
    from: string,
    to: string,
    message: EmailMessage,
    messageId: string,
    timeoutMs: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const done = (err?: Error) => {
        if (isSettled) return;
        isSettled = true;
        try {
          socket.end();
          socket.destroy();
        } catch {}
        if (err) reject(err);
        else resolve();
      };

      const timer = setTimeout(() => {
        done(new Error(`SMTP bağlantısı zaman aşımına uğradı (${timeoutMs} ms)`));
      }, timeoutMs);

      const cleanFrom = from.replace(/.*<([^>]+)>.*/, '$1').trim();
      const cleanTo = to.replace(/.*<([^>]+)>.*/, '$1').trim();

      const options = {
        host: this.config.host,
        port: this.config.port
      };

      let socket: net.Socket;

      if (this.config.secure) {
        socket = tls.connect(options, onConnected);
      } else {
        socket = net.connect(options, onConnected);
      }

      socket.setTimeout(timeoutMs);
      socket.on('timeout', () => done(new Error('SMTP soket zaman aşımı')));
      socket.on('error', (err) => done(err));

      let buffer = '';
      let step = 'WAIT_GREETING';

      function sendCmd(cmd: string) {
        socket.write(cmd + '\r\n');
      }

      function onConnected() {
        // Soket bağlandı, sunucudan 220 selamlaması bekleniyor
      }

      socket.on('data', async (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\r\n');
        // Son eleman eksik satır olabilir
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line) continue;
          const code = Number(line.slice(0, 3));
          const isMultiline = line[3] === '-';
          if (isMultiline) continue; // Çok satırlı yanıtın son satırını bekle

          try {
            switch (step) {
              case 'WAIT_GREETING':
                if (code !== 220) throw new Error(`Beklenmeyen SMTP karşılama kodu: ${line}`);
                step = 'WAIT_EHLO';
                sendCmd('EHLO socialflow.ai');
                break;

              case 'WAIT_EHLO':
                if (code !== 250) throw new Error(`EHLO reddedildi: ${line}`);
                if (this.config.user && this.config.pass) {
                  step = 'WAIT_AUTH_LOGIN';
                  sendCmd('AUTH LOGIN');
                } else {
                  step = 'WAIT_MAIL_FROM';
                  sendCmd(`MAIL FROM:<${cleanFrom}>`);
                }
                break;

              case 'WAIT_AUTH_LOGIN':
                if (code !== 334) throw new Error(`AUTH LOGIN başlatılamadı: ${line}`);
                step = 'WAIT_AUTH_USER';
                sendCmd(Buffer.from(this.config.user || '').toString('base64'));
                break;

              case 'WAIT_AUTH_USER':
                if (code !== 334) throw new Error(`AUTH kullanıcı adı reddedildi: ${line}`);
                step = 'WAIT_AUTH_PASS';
                sendCmd(Buffer.from(this.config.pass || '').toString('base64'));
                break;

              case 'WAIT_AUTH_PASS':
                if (code !== 235) throw new Error(`Kimlik doğrulama başarısız: ${line}`);
                step = 'WAIT_MAIL_FROM';
                sendCmd(`MAIL FROM:<${cleanFrom}>`);
                break;

              case 'WAIT_MAIL_FROM':
                if (code !== 250) throw new Error(`MAIL FROM reddedildi: ${line}`);
                step = 'WAIT_RCPT_TO';
                sendCmd(`RCPT TO:<${cleanTo}>`);
                break;

              case 'WAIT_RCPT_TO':
                if (code !== 250 && code !== 251) throw new Error(`RCPT TO reddedildi: ${line}`);
                step = 'WAIT_DATA';
                sendCmd('DATA');
                break;

              case 'WAIT_DATA':
                if (code !== 354) throw new Error(`DATA komutu reddedildi: ${line}`);
                step = 'WAIT_DATA_END';
                const emailContent = buildMimeMessage(from, to, message, messageId);
                sendCmd(emailContent + '\r\n.');
                break;

              case 'WAIT_DATA_END':
                if (code !== 250) throw new Error(`E-posta içeriği reddedildi: ${line}`);
                step = 'WAIT_QUIT';
                sendCmd('QUIT');
                break;

              case 'WAIT_QUIT':
                clearTimeout(timer);
                done();
                break;
            }
          } catch (err: any) {
            clearTimeout(timer);
            done(err);
          }
        }
      });
    });
  }
}

/**
 * RFC 5322 MIME e-posta gövdesi oluşturur.
 */
function buildMimeMessage(from: string, to: string, message: EmailMessage, messageId: string): string {
  const boundary = `----=_Part_${randomBytes(12).toString('hex')}`;
  const utf8Subject = `=?UTF-8?B?${Buffer.from(message.subject, 'utf8').toString('base64')}?=`;
  const date = new Date().toUTCString();

  const headers: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0'
  ];

  if (message.replyTo) {
    headers.push(`Reply-To: ${message.replyTo}`);
  }

  if (message.html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return (
      headers.join('\r\n') +
      '\r\n\r\n' +
      `--${boundary}\r\n` +
      'Content-Type: text/plain; charset=UTF-8\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      wrapBase64(Buffer.from(message.text, 'utf8').toString('base64')) +
      '\r\n\r\n' +
      `--${boundary}\r\n` +
      'Content-Type: text/html; charset=UTF-8\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      wrapBase64(Buffer.from(message.html, 'utf8').toString('base64')) +
      '\r\n\r\n' +
      `--${boundary}--`
    );
  }

  headers.push('Content-Type: text/plain; charset=UTF-8');
  headers.push('Content-Transfer-Encoding: base64');
  return headers.join('\r\n') + '\r\n\r\n' + wrapBase64(Buffer.from(message.text, 'utf8').toString('base64'));
}

function wrapBase64(str: string): string {
  return str.replace(/(.{76})/g, '$1\r\n');
}
