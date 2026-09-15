import { apiRoute, ok } from '@/lib/api';
import { advertisingOverview } from '@/lib/advertising/service';
import { advertisingResponse } from '@/lib/advertising/route';
export const GET = apiRoute((_request, { session }) => advertisingResponse(async () => ok(await advertisingOverview(session))));
