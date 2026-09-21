/**
 * E-posta Sağlayıcı Soyutlaması Tür Tanımları (§107)
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<SendEmailResult>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  secure?: boolean; // port 465 SSL/TLS vs 587 STARTTLS
  from: string;
  timeoutMs?: number;
}
