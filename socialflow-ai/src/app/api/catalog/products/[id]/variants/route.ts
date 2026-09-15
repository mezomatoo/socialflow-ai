import { apiRoute, ok } from '@/lib/api';
import { businessResponse, businessBody } from '@/lib/business/http';
import { listProducts, getProduct, createProduct, updateProduct, addVariant, updateVariant } from '@/lib/catalog/service';
export const POST = apiRoute((r, { session, params }) => businessResponse(async () => ok(await addVariant(session, params.id, await businessBody(r)))), { sessionCsrf: true, limit: 30 });
