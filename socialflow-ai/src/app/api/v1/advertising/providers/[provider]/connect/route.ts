import { apiRoute } from '@/lib/api';
import { requestAdvertisingConnection } from '@/lib/advertising/service';
import { advertisingResponse } from '@/lib/advertising/route';
export const POST = apiRoute((_request, { session, params }) => advertisingResponse(() => requestAdvertisingConnection(session, params.provider)), { limit: 15, sessionCsrf: true });
