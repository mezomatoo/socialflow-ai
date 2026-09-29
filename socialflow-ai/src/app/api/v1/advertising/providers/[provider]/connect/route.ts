import { apiRoute, ok } from '@/lib/api';
import { requestAdvertisingConnection } from '@/lib/advertising/service';
import { advertisingResponse } from '@/lib/advertising/route';
export const POST = apiRoute((_request, { session, params }) => advertisingResponse(async () => ok(await requestAdvertisingConnection(session, params.provider))), { limit: 15, sessionCsrf: true });
