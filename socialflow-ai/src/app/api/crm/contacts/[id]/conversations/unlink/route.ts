import { apiRoute, ok } from '@/lib/api';
import { businessResponse, businessBody } from '@/lib/business/http';
import { unlinkConversation } from '@/lib/crm/service';
export const POST = apiRoute((r, { session, params }) => businessResponse(async () => ok(await unlinkConversation(session, params.id, await businessBody(r)))), { sessionCsrf: true, limit: 30 });
