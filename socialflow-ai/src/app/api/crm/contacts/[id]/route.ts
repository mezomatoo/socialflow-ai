import { apiRoute, ok } from '@/lib/api';
import { businessResponse, businessBody } from '@/lib/business/http';
import { getContact, updateContact } from '@/lib/crm/service';
export const GET = apiRoute((r, { session, params }) => businessResponse(async () => ok(await getContact(session, params.id))));
export const PATCH = apiRoute((r, { session, params }) => businessResponse(async () => ok(await updateContact(session, params.id, await businessBody(r)))), { sessionCsrf: true, limit: 30 });
