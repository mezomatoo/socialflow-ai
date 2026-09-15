import { apiRoute, ok, notFound } from '@/lib/api';
import prisma from '@/lib/prisma';
import { authorizeInbox } from '@/lib/inbox/service';
import { inboxResponse } from '@/lib/inbox/route';
export const GET = apiRoute((_request, { session, params }) => inboxResponse(async () => {
  await authorizeInbox(session.user);
  const event = await prisma.inboxEvent.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId }, select: { id: true, status: true, conversationId: true } });
  if (!event) return notFound();
  const job = await prisma.job.findUnique({ where: { idempotencyKey: `inbox:${event.id}` }, select: { status: true } });
  return ok({ ...event, failed: job?.status === 'FAILED' });
}));
