import { apiRoute, ok } from '@/lib/api';
import { listConversations, queueManualInteraction } from '@/lib/inbox/service';
import { inboxBody, inboxResponse } from '@/lib/inbox/route';
export const GET = apiRoute((request, { session }) => inboxResponse(async () => ok(await listConversations(session.user, new URL(request.url).searchParams))));
export const POST = apiRoute((request, { session }) => inboxResponse(async () => ok(await queueManualInteraction(session.user, await inboxBody(request)), { status: 202 })), { limit: 30, sessionCsrf: true });
