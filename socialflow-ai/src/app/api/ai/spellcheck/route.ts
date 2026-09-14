import { apiRoute, ok } from '@/lib/api';
import { checkTurkishSpelling } from '@/lib/ai/captionGenerationService';

export const POST = apiRoute(
  async (request) => {
    const body = await request.json().catch(() => ({}));
    const result = checkTurkishSpelling(String(body.text ?? ''));
    return ok(result);
  },
  { limit: 60 }
);
