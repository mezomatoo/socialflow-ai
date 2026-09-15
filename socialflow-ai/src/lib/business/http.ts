import { Prisma } from '@prisma/client';
import { fail } from '../api';
import { BusinessError } from './access';
export async function businessResponse(run: () => Promise<Response>) {
  try { const r = await run(); r.headers.set('Cache-Control', 'no-store'); return r; }
  catch (e) {
    const r = e instanceof BusinessError ? fail(e.code, e.message, e.status)
      : e instanceof SyntaxError ? fail('INVALID_INPUT', 'Geçersiz JSON.', 400)
      : e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? fail('DUPLICATE', 'Bu benzersiz kayıt zaten var.', 409)
      : e instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2028'].includes(e.code) ? fail('CONFLICT', 'Eş zamanlı değişiklik oldu; yenileyip tekrar deneyin.', 409)
      : fail('INTERNAL_ERROR', 'İşlem tamamlanamadı.', 500);
    r.headers.set('Cache-Control', 'no-store'); return r;
  }
}
export async function businessBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new BusinessError('INVALID_INPUT', 'JSON gerekli.', 415);
  const reader = request.body?.getReader(); if (!reader) throw new BusinessError('INVALID_INPUT', 'Gövde gerekli.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 16384) { await reader.cancel(); throw new BusinessError('TOO_LARGE', 'İstek çok büyük.', 413); } chunks.push(value); }
  const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new BusinessError('INVALID_INPUT', 'Nesne gerekli.'); return v;
}
