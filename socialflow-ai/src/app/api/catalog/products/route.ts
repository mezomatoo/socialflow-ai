import { apiRoute, ok } from '@/lib/api';
import { businessResponse, businessBody } from '@/lib/business/http';
import { listProducts, getProduct, createProduct, updateProduct, addVariant, updateVariant } from '@/lib/catalog/service';
export const GET = apiRoute((r, { session }) => businessResponse(async () => ok(await listProducts(session, new URL(r.url).searchParams))));
export const POST = apiRoute((r, { session }) => businessResponse(async () => ok(await createProduct(session, await businessBody(r)))), { sessionCsrf: true, limit: 30 });
