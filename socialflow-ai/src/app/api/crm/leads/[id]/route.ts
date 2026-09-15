import { apiRoute, ok } from '@/lib/api';
import { businessResponse, businessBody } from '@/lib/business/http';
import { updateLead } from '@/lib/crm/service';
export const PATCH = apiRoute((r, { session, params }) => businessResponse(async () => ok(await updateLead(session, params.id, await businessBody(r)))), { sessionCsrf: true, limit: 30 });
