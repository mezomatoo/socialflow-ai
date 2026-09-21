import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'net';
import { randomUUID } from 'crypto';
import prisma from '../src/lib/prisma';
import { SmtpEmailProvider } from '../src/lib/email/smtpProvider';
import { ResendEmailProvider, SendGridEmailProvider } from '../src/lib/email/apiProvider';
import { MemoryEmailProvider, ConsoleEmailProvider } from '../src/lib/email/memoryProvider';
import { EmailService } from '../src/lib/email/service';
import { POST as forgotPasswordPost } from '../src/app/api/v1/auth/forgot-password/route';
import { env } from '../src/lib/env';
import { NextRequest } from 'next/server';

if (!process.env.DATABASE_URL?.endsWith('test.db')) {
  throw new Error('Yalnızca ayrı test.db üzerinde çalıştırın.');
}

describe('③ E-posta Sağlayıcı Soyutlaması ve Güvenlik Denetimi (§107)', { concurrency: 1 }, () => {
  let workspaceId: string;
  let testUserId: string;
  const testEmail = `user-${randomUUID()}@test.invalid`;

  before(async () => {
    const ws = await prisma.workspace.create({
      data: { name: 'Email Test Workspace', slug: `ws-email-${randomUUID()}` }
    });
    workspaceId = ws.id;

    const user = await prisma.user.create({
      data: {
        workspaceId,
        email: testEmail,
        name: 'Ayşe Kaya',
        passwordHash: 'hashed-password-xyz',
        isActive: true
      }
    });
    testUserId = user.id;
  });

  after(async () => {
    await prisma.passwordResetToken.deleteMany({
      where: { userId: testUserId }
    });
    await prisma.user.deleteMany({
      where: { id: testUserId }
    });
    await prisma.workspace.deleteMany({
      where: { id: workspaceId }
    });
  });

  it('Memory ve Console e-posta sağlayıcıları başarıyla ileti teslim eder', async () => {
    const memory = new MemoryEmailProvider();
    const service = new EmailService(memory);

    const result = await service.sendEmail({
      to: 'alici@example.com',
      subject: 'Test Konu',
      text: 'Test içerik'
    });

    assert.equal(result.success, true);
    assert.equal(result.provider, 'memory');
    assert.equal(memory.outbox.length, 1);
    assert.equal(memory.outbox[0].to, 'alici@example.com');
    assert.equal(memory.outbox[0].subject, 'Test Konu');

    const consoleProvider = new ConsoleEmailProvider();
    const consoleResult = await consoleProvider.send({
      to: 'alici@example.com',
      subject: 'Konsol Test',
      text: 'Konsol mesajı'
    });
    assert.equal(consoleResult.success, true);
    assert.equal(consoleResult.provider, 'console');
  });

  it('Resend ve SendGrid API sağlayıcıları HTTP isteklerini doğru zarf ile iletir', async () => {
    let resendCalledWith: any;
    const mockResendFetch: typeof fetch = async (url, init) => {
      resendCalledWith = { url: String(url), headers: init?.headers, body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ id: 'resend_msg_123' }), { status: 200 });
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockResendFetch;

    try {
      const resend = new ResendEmailProvider('re_test_key_123');
      const resendRes = await resend.send({
        to: 'test@resend.invalid',
        subject: 'Resend Test',
        text: 'Metin',
        html: '<p>HTML</p>'
      });
      assert.equal(resendRes.success, true);
      assert.equal(resendRes.messageId, 'resend_msg_123');
      assert.equal(resendCalledWith.url, 'https://api.resend.com/emails');
      assert.deepEqual(resendCalledWith.body.to, ['test@resend.invalid']);
      assert.equal(resendCalledWith.body.html, '<p>HTML</p>');

      // SendGrid
      let sendgridCalledWith: any;
      const mockSendGridFetch: typeof fetch = async (url, init) => {
        sendgridCalledWith = { url: String(url), headers: init?.headers, body: JSON.parse(String(init?.body)) };
        return new Response('', { status: 202, headers: { 'x-message-id': 'sg_msg_987' } });
      };
      globalThis.fetch = mockSendGridFetch;

      const sendgrid = new SendGridEmailProvider('SG.test_key');
      const sgRes = await sendgrid.send({
        to: 'test@sendgrid.invalid',
        subject: 'SendGrid Test',
        text: 'SG Metin'
      });
      assert.equal(sgRes.success, true);
      assert.equal(sgRes.messageId, 'sg_msg_987');
      assert.equal(sendgridCalledWith.url, 'https://api.sendgrid.com/v3/mail/send');
      assert.equal(sendgridCalledWith.body.personalizations[0].to[0].email, 'test@sendgrid.invalid');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('SmtpEmailProvider: gerçek SMTP protokolünü (EHLO, AUTH, MAIL FROM, RCPT TO, DATA, QUIT) soket üzerinde yürütür', async () => {
    // Yerel hafif test SMTP sunucusu başlatalım
    const recordedCommands: string[] = [];

    const server = net.createServer((socket) => {
      socket.write('220 smtp.test.local ESMTP Mock\r\n');
      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString('utf8');
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          recordedCommands.push(line);
          if (line.startsWith('EHLO')) {
            socket.write('250-smtp.test.local\r\n250 AUTH LOGIN\r\n');
          } else if (line.startsWith('AUTH LOGIN')) {
            socket.write('334 VXNlcm5hbWU6\r\n'); // Username:
          } else if (line === Buffer.from('testuser').toString('base64')) {
            socket.write('334 UGFzc3dvcmQ6\r\n'); // Password:
          } else if (line === Buffer.from('testpass').toString('base64')) {
            socket.write('235 2.7.0 Authentication successful\r\n');
          } else if (line.startsWith('MAIL FROM:')) {
            socket.write('250 2.1.0 Ok\r\n');
          } else if (line.startsWith('RCPT TO:')) {
            socket.write('250 2.1.5 Ok\r\n');
          } else if (line === 'DATA') {
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          } else if (line === '.') {
            socket.write('250 2.0.0 Ok: queued as MOCK12345\r\n');
          } else if (line === 'QUIT') {
            socket.write('221 2.0.0 Bye\r\n');
            socket.end();
          }
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as net.AddressInfo).port;

    try {
      const smtp = new SmtpEmailProvider({
        host: '127.0.0.1',
        port,
        user: 'testuser',
        pass: 'testpass',
        secure: false,
        from: 'SocialFlow AI <noreply@socialflow.ai>',
        timeoutMs: 5000
      });

      const sendResult = await smtp.send({
        to: 'musteri@example.com',
        subject: 'Sosyal Akış Bildirimi',
        text: 'Merhaba SMTP içeriği',
        html: '<p>Merhaba SMTP içeriği</p>'
      });

      assert.equal(sendResult.success, true);
      assert.equal(sendResult.provider, 'smtp');

      // SMTP komutlarının sırasıyla çalıştırıldığının teyidi
      assert.ok(recordedCommands.some((c) => c.startsWith('EHLO')));
      assert.ok(recordedCommands.includes('AUTH LOGIN'));
      assert.ok(recordedCommands.some((c) => c.startsWith('MAIL FROM:<noreply@socialflow.ai>')));
      assert.ok(recordedCommands.some((c) => c.startsWith('RCPT TO:<musteri@example.com>')));
      assert.ok(recordedCommands.includes('DATA'));
      assert.ok(recordedCommands.includes('.'));
      assert.ok(recordedCommands.includes('QUIT'));
    } finally {
      server.close();
    }
  });

  it('sendPasswordResetEmail: Türkçe şablon, 30 dakika uyarısı ve kullanıcı adını içerir', async () => {
    const memory = new MemoryEmailProvider();
    const service = new EmailService(memory);

    await service.sendPasswordResetEmail({
      to: 'ayse@example.com',
      resetUrl: 'https://app.socialflow.ai/sifremi-sifirla?token=abc123token',
      userName: 'Ayşe Kaya'
    });

    assert.equal(memory.outbox.length, 1);
    const sent = memory.outbox[0];
    assert.equal(sent.to, 'ayse@example.com');
    assert.ok(sent.subject.includes('Şifre Sıfırlama'));
    assert.ok(sent.text.includes('Ayşe Kaya'));
    assert.ok(sent.text.includes('https://app.socialflow.ai/sifremi-sifirla?token=abc123token'));
    assert.ok(sent.text.includes('30 dakika'));
    assert.ok(sent.html?.includes('Şifremi Sıfırla'));
  });

  it('GÜVENLİK (§107): Üretim ortamında devHint KESİNLİKLE kapalıdır (undefined)', async () => {
    // Üretim ortamını simüle et
    const origEnv = env.isProduction;
    const origAppEnv = env.appEnv;
    (env as any).isProduction = true;
    (env as any).appEnv = 'production';

    try {
      const req = new NextRequest('http://localhost/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: testEmail })
      });

      const res = await forgotPasswordPost(req, { params: {} } as any);
      assert.equal(res.status, 200);
      const json = await res.json();
      const payload = json.data || json;

      // Nötr mesaj dönmeli
      assert.ok(payload.message.includes('şifre sıfırlama bağlantısı gönderildi'));
      // devHint KESİNLİKLE undefined olmalı
      assert.equal(payload.devHint, undefined);

      // Veritabanında token SHA-256 olarak saklanmış olmalı
      const tokenRecord = await prisma.passwordResetToken.findFirst({
        where: { userId: testUserId },
        orderBy: { createdAt: 'desc' }
      });
      assert.ok(tokenRecord);
      assert.equal(tokenRecord.tokenHash.length, 64); // SHA-256 hex
    } finally {
      (env as any).isProduction = origEnv;
      (env as any).appEnv = origAppEnv;
    }
  });

  it('Geliştirme ortamında devHint döner, kayıtlı olmayan e-postada kullanıcı numaralandırma engellenir', async () => {
    const origEnv = env.isProduction;
    const origAppEnv = env.appEnv;
    (env as any).isProduction = false;
    (env as any).appEnv = 'development';

    try {
      // 1. Kayıtlı kullanıcı -> devHint döner
      const req = new NextRequest('http://localhost/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: testEmail })
      });

      const res = await forgotPasswordPost(req, { params: {} } as any);
      assert.equal(res.status, 200);
      const json = await res.json();
      const payload = json.data || json;
      assert.ok(payload.devHint?.includes('/sifremi-sifirla?token='));

      // 2. Kayıtlı olmayan e-posta -> birebir aynı nötr mesaj döner, devHint tanımsızdır
      const reqNonExistent = new NextRequest('http://localhost/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'olmayan-kullanici@example.com' })
      });

      const resNonExistent = await forgotPasswordPost(reqNonExistent, { params: {} } as any);
      assert.equal(resNonExistent.status, 200);
      const jsonNonExistent = await resNonExistent.json();
      const payloadNonExistent = jsonNonExistent.data || jsonNonExistent;
      assert.equal(payloadNonExistent.message, payload.message); // Kullanıcı numaralandırma engeli
      assert.equal(payloadNonExistent.devHint, undefined);
    } finally {
      (env as any).isProduction = origEnv;
      (env as any).appEnv = origAppEnv;
    }
  });
});
