import { apiRoute } from '@/lib/api';
import { requestFinancialOperation } from '@/lib/advertising/service';
import { advertisingResponse } from '@/lib/advertising/route';
/** Explicit rejection endpoint. Does not submit, pause, resume, edit budget or enqueue work. */
export const POST = apiRoute((_request, { session }) => advertisingResponse(() => requestFinancialOperation(session)), { limit: 15, sessionCsrf: true });
