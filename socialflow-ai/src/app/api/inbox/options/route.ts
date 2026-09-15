import { apiRoute, ok } from '@/lib/api';
import { inboxOptions } from '@/lib/inbox/service';
import { inboxResponse } from '@/lib/inbox/route';
export const GET = apiRoute((_request, { session }) => inboxResponse(async () => ok(await inboxOptions(session.user))));
