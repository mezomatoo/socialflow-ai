import { apiRoute, ok } from '@/lib/api';
import { listAdAccounts } from '@/lib/advertising/service';
import { advertisingResponse } from '@/lib/advertising/route';
export const GET = apiRoute((request, { session }) => advertisingResponse(async () => ok(await listAdAccounts(session, new URL(request.url).searchParams))));
