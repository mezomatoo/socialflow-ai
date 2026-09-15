import { fail } from '../api';
import { InboxError } from './contracts';
/** Sanitized errors: conversation text/provider payloads never enter logs. */
export async function inboxResponse(run: () => Promise<Response>) {
  try { return await run(); }
  catch (error) {
    if (error instanceof InboxError) return fail(error.code, error.message, error.status);
    if (error instanceof SyntaxError) return fail('INVALID_INPUT', 'Geçersiz JSON gövdesi.', 400);
    return fail('INBOX_ERROR', 'İşlem tamamlanamadı. Lütfen yenileyip tekrar deneyin.', 500);
  }
}
export async function inboxBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new InboxError('INVALID_INPUT', 'JSON gövdesi gerekli.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new InboxError('INVALID_INPUT', 'İstek gövdesi gerekli.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 32_768) { await reader.cancel(); throw new InboxError('TOO_LARGE', 'İstek gövdesi çok büyük.', 413); }
    chunks.push(value);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new InboxError('INVALID_INPUT', 'Geçersiz istek.');
  return body;
}
