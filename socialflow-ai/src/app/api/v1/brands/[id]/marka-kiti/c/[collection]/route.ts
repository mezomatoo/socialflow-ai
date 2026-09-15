import { apiRoute, ok, notFound, badRequest } from '@/lib/api';
import { getCollection } from '@/lib/brandkit/collections';
import { createItem, ValidationError, NotFoundError } from '@/lib/brandkit/mutations';

/**
 * PHASE 4 — Brand Kit genel koleksiyon ucu (config-driven)
 * POST /api/brands/:id/marka-kiti/c/:collection
 * `:collection` beyaz listesi collections.ts'te; tüm güvenlik/izolasyon/kilit
 * kuralları mutations.ts içinde uygulanır.
 */

export const POST = apiRoute(
  async (request, { session, params }) => {
    const def = getCollection(params.collection);
    if (!def) return notFound('Bilinmeyen koleksiyon.');
    const body = await request.json().catch(() => ({}));
    try {
      const created = await createItem(session, params.id, def, body, request);
      return ok(created);
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message);
      if (e instanceof NotFoundError) return notFound(e.message);
      throw e;
    }
  },
  { limit: 60 }
);
