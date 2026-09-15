import { apiRoute, ok } from '@/lib/api';
import { businessResponse, businessBody } from '@/lib/business/http';
import { listProducts, getProduct, createProduct, updateProduct, addVariant, updateVariant } from '@/lib/catalog/service';
export const GET = apiRoute((_r, { session, params }) => businessResponse(async () => ok(await getProduct(session, params.id))));
export const PATCH = apiRoute((r, { session, params }) => businessResponse(async () => ok(await updateProduct(session, params.id, await businessBody(r)))), { sessionCsrf: true, limit: 30 });
