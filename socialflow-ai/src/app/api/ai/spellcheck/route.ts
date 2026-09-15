import { apiRoute, ok, badRequest } from '@/lib/api';
import { checkTurkishSpelling } from '@/lib/ai/captionGenerationService';

/** AI İçerik Asistanı — Türkçe yazım kontrolü (deterministik kural motoru). */
export const POST = apiRoute(
  async (request) => {
    const body = await request.json().catch(() => ({}));
    const text = String(body.text ?? '');
    if (!text.trim()) return badRequest('Yazım kontrolü için metin gerekli.');
    return ok(checkTurkishSpelling(text));
  },
  { limit: 30, windowMs: 60_000 }
);
