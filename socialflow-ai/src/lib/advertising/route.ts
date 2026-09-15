import { fail } from '../api';
import { AdvertisingError } from './contracts';
export async function advertisingResponse(run: () => Promise<Response>) {
  try { const response = await run(); response.headers.set('Cache-Control', 'no-store'); return response; }
  catch (error) {
    const response = error instanceof AdvertisingError ? fail(error.code, error.message, error.status)
      : error instanceof SyntaxError ? fail('INVALID_INPUT', 'Geçersiz JSON gövdesi.', 400)
      : fail('ADVERTISING_ERROR', 'Reklam işlemi tamamlanamadı. Lütfen tekrar deneyin.', 500);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
export async function advertisingBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new AdvertisingError('INVALID_INPUT', 'JSON gövdesi gerekli.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AdvertisingError('INVALID_INPUT', 'İstek gövdesi gerekli.');
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 16384) { await reader.cancel(); throw new AdvertisingError('TOO_LARGE', 'İstek gövdesi çok büyük.', 413); }
    chunks.push(value);
  }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new AdvertisingError('INVALID_INPUT', 'Geçersiz istek.');
  return result;
}
