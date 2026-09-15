import { apiRoute, ok } from '@/lib/api';
import { businessResponse, businessBody } from '@/lib/business/http';
import { listContacts, createContact } from '@/lib/crm/service';
export const GET = apiRoute((r, { session, params }) => businessResponse(async () => ok(await listContacts(session, new URL(r.url).searchParams))));
export const POST = apiRoute((r, { session, params }) => businessResponse(async () => ok(await createContact(session, await businessBody(r)))), { sessionCsrf: true, limit: 30 });
