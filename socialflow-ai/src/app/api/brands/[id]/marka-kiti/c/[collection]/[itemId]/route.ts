import { apiRoute, ok, notFound, badRequest } from '@/lib/api';
import { getCollection } from '@/lib/brandkit/collections';
import { updateItem, deleteItem, ValidationError, NotFoundError } from '@/lib/brandkit/mutations';

/**
 * PHASE 4 — Brand Kit koleksiyon öğesi ucu
 * PATCH/DELETE /api/brands/:id/marka-kiti/c/:collection/:itemId
 */

export const PATCH = apiRoute(
  async (request, { session, params }) => {
    const def = getCollection(params.collection);
    if (!def) return notFound('Bilinmeyen koleksiyon.');
    const body = await request.json().catch(() => ({}));
    try {
      const updated = await updateItem(session, params.id, def, params.itemId, body, request);
      return ok(updated);
    } catch (e) {
      if (e instanceof ValidationError) return badRequest(e.message);
      if (e instanceof NotFoundError) return notFound(e.message);
      throw e;
    }
  },
  { limit: 60 }
);

export const DELETE = apiRoute(
  async (request, { session, params }) => {
    const def = getCollection(params.collection);
    if (!def) return notFound('Bilinmeyen koleksiyon.');
    try {
      const result = await deleteItem(session, params.id, def, params.itemId, request);
      return ok(result);
    } catch (e) {
      if (e instanceof NotFoundError) return notFound(e.message);
      throw e;
    }
  },
  { limit: 40 }
);
