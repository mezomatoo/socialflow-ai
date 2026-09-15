import { apiRoute, ok } from '@/lib/api';
import { getConversation, updateConversation } from '@/lib/inbox/service';
import { inboxBody, inboxResponse } from '@/lib/inbox/route';
export const GET = apiRoute((_request, { session, params }) => inboxResponse(async () => ok(await getConversation(session.user, params.id))));
export const PATCH = apiRoute((request, { session, params }) => inboxResponse(async () => ok(await updateConversation(session.user, params.id, await inboxBody(request)))), { limit: 60, sessionCsrf: true });
