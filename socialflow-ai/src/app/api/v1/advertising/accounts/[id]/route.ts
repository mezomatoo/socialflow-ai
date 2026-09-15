import { apiRoute, ok } from '@/lib/api';
import { getAdAccount, mapAdAccountBrand } from '@/lib/advertising/service';
import { advertisingBody, advertisingResponse } from '@/lib/advertising/route';
export const GET = apiRoute((_request, { session, params }) => advertisingResponse(async () => ok(await getAdAccount(session, params.id))));
export const PATCH = apiRoute((request, { session, params }) => advertisingResponse(async () => ok(await mapAdAccountBrand(session, params.id, await advertisingBody(request)))), { limit: 30, sessionCsrf: true });
