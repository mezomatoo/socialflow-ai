import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import type { SessionContext } from '../auth/session';
import { isFeatureEnabled } from '../brandkit/featureFlags';
import { CONVERSATION_STATUSES, CONVERSATION_TYPES, PRIORITIES, canManageInbox, InboxError, enumInput, inputText } from './contracts';

type Actor = SessionContext['user'];
const missing = () => new InboxError('NOT_FOUND', 'Kayıt bulunamadı.', 404);
export async function authorizeInbox(actor: Actor, write = false) {
  if (!isFeatureEnabled('unifiedInbox')) throw new InboxError('FEATURE_DISABLED', 'Gelen Kutusu bu kurulumda kapalı.', 404);
  // Re-check the persisted user, including preview sessions; never trust role/workspace from a request body.
  const user = await prisma.user.findFirst({ where: { id: actor.id, workspaceId: actor.workspaceId, isActive: true } });
  if (!user || (write && !canManageInbox(user.role))) throw new InboxError('FORBIDDEN', 'Bu işlem için yetkiniz bulunmuyor.', 403);
  return user;
}
const summaryInclude = {
  brand: { select: { id: true, name: true } },
  account: { select: { id: true, handle: true, displayName: true } },
  participant: { select: { id: true, displayName: true } }, tags: { select: { name: true } },
  messages: { where: { direction: 'INBOUND' }, orderBy: { sentAt: 'desc' as const }, take: 1, select: { text: true, direction: true } },
  _count: { select: { messages: { where: { direction: 'INBOUND', isRead: false } } } }
};
export async function inboxOptions(actor: Actor) {
  const user = await authorizeInbox(actor);
  const workspaceId = actor.workspaceId;
  const [accounts, brands, users] = await Promise.all([
    prisma.socialAccount.findMany({ where: { workspaceId, brandId: { not: null } }, select: { id: true, brandId: true, platform: true, displayName: true, handle: true }, orderBy: { displayName: 'asc' } }),
    prisma.brand.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { workspaceId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  ]);
  return { accounts, brands, users, userId: actor.id, canManage: canManageInbox(user.role) };
}
export async function listConversations(actor: Actor, params: URLSearchParams) {
  await authorizeInbox(actor);
  const where: Prisma.SocialConversationWhereInput = { workspaceId: actor.workspaceId };
  const q = params.get('q')?.trim().slice(0, 200);
  if (q) where.OR = [{ participant: { displayName: { contains: q } } }, { messages: { some: { text: { contains: q } } } }, { tags: { some: { name: { contains: q } } } }];
  if (params.get('status')) where.status = enumInput(CONVERSATION_STATUSES, params.get('status'));
  if (params.get('priority')) where.priority = enumInput(PRIORITIES, params.get('priority'));
  if (params.get('type')) where.type = enumInput(CONVERSATION_TYPES, params.get('type'));
  if (params.get('platform')) where.provider = params.get('platform')!.slice(0, 50);
  if (params.get('brand')) where.brandId = params.get('brand')!;
  if (params.get('account')) where.socialAccountId = params.get('account')!;
  if (params.get('assigned')) where.assignedTo = params.get('assigned') === 'me' ? actor.id : params.get('assigned') === 'none' ? null : params.get('assigned')!;
  if (params.get('unread') === 'true') where.messages = { some: { direction: 'INBOUND', isRead: false } };
  const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
  const [items, total] = await prisma.$transaction([
    prisma.socialConversation.findMany({ where, include: summaryInclude, orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }], take: 30, skip: (Math.floor(page) - 1) * 30 }),
    prisma.socialConversation.count({ where })
  ]);
  return { items, total, page: Math.floor(page) };
}
export async function getConversation(actor: Actor, id: string) {
  await authorizeInbox(actor);
  const result = await prisma.socialConversation.findFirst({ where: { id, workspaceId: actor.workspaceId }, include: {
    ...summaryInclude,
    messages: { orderBy: [{ sentAt: 'asc' }, { id: 'asc' }], take: 500, select: { id: true, text: true, direction: true, sender: true, sentAt: true, isRead: true } },
    assignments: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, assignedTo: true, createdAt: true, actor: { select: { name: true } } } }
  } });
  if (!result) throw missing();
  const link = isFeatureEnabled('socialCRM') ? await prisma.contactConversationLink.findFirst({ where: { workspaceId: actor.workspaceId, conversationId: id }, select: { contactId: true } }) : null;
  return { ...result, crmContactId: link?.contactId ?? null };
}

/** Authenticated, explicitly manual input. Not a provider webhook or provider-verified identity. */
export async function queueManualInteraction(actor: Actor, body: Record<string, unknown>) {
  await authorizeInbox(actor, true);
  const socialAccountId = inputText(body.socialAccountId, 'Hesap', 100);
  const eventKey = inputText(body.eventKey, 'İstek kimliği', 100);
  const payload = { name: inputText(body.name, 'Görünen ad', 100), text: inputText(body.text, 'Mesaj', 5000), type: enumInput(CONVERSATION_TYPES, body.type) };
  const serialized = JSON.stringify(payload);
  const payloadHash = createHash('sha256').update(socialAccountId + serialized).digest('hex');
  return prisma.$transaction(async tx => {
    const account = await tx.socialAccount.findFirst({ where: { id: socialAccountId, workspaceId: actor.workspaceId, brandId: { not: null } } });
    if (!account) throw missing();
    const existing = await tx.inboxEvent.findUnique({ where: { workspaceId_eventKey: { workspaceId: actor.workspaceId, eventKey } } });
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new InboxError('CONFLICT', 'Bu istek kimliği farklı bir kayıt için kullanılmış.', 409);
      return { id: existing.id, conversationId: existing.conversationId, status: existing.status };
    }
    const event = await tx.inboxEvent.create({ data: { workspaceId: actor.workspaceId, socialAccountId, eventKey, payload: serialized, payloadHash, createdBy: actor.id } });
    await tx.job.create({ data: { workspaceId: actor.workspaceId, type: 'InboxEventJob', payload: JSON.stringify({ eventId: event.id }), idempotencyKey: `inbox:${event.id}`, maxAttempts: 3 } });
    await tx.auditLog.create({ data: { workspaceId: actor.workspaceId, userId: actor.id, action: 'inbox.manual.queued', entityType: 'InboxEvent', entityId: event.id } });
    return { id: event.id, conversationId: null, status: 'QUEUED' };
  });
}

/** Same transaction owns deduplication, conversation, notification and audit. Worker can safely retry. */
export async function processInboxEvent(workspaceId: string, eventId: string) {
  if (!isFeatureEnabled('unifiedInbox')) throw new InboxError('FEATURE_DISABLED', 'Gelen Kutusu kapalı.', 404);
  return prisma.$transaction(async tx => {
    const event = await tx.inboxEvent.findFirst({ where: { id: eventId, workspaceId } });
    if (!event) throw missing();
    if (event.status === 'DONE') return { conversationId: event.conversationId, duplicate: true };
    if (event.source !== 'MANUAL') throw new InboxError('UNSUPPORTED_SOURCE', 'Doğrulanmamış olay kaynağı.');
    const account = await tx.socialAccount.findFirst({ where: { id: event.socialAccountId, workspaceId, brandId: { not: null } } });
    if (!account?.brandId) throw missing();
    const brand = await tx.brand.findFirst({ where: { id: account.brandId, workspaceId } });
    if (!brand) throw missing();
    const actor = await tx.user.findFirst({ where: { id: event.createdBy, workspaceId, isActive: true } });
    if (!actor || !canManageInbox(actor.role)) throw new InboxError('FORBIDDEN', 'Olayı oluşturan kullanıcının yetkisi geçerli değil.', 403);
    const payload = JSON.parse(event.payload);
    const name = inputText(payload.name, 'Görünen ad', 100);
    const text = inputText(payload.text, 'Mesaj', 5000);
    const type = enumInput(CONVERSATION_TYPES, payload.type);
    const now = new Date();
    // Never merge manual identities based on matching display name.
    const participant = await tx.socialParticipant.create({ data: { workspaceId, socialAccountId: account.id, providerParticipantId: `manual:${event.id}`, displayName: name } });
    const conversation = await tx.socialConversation.create({ data: {
      workspaceId, socialAccountId: account.id, brandId: brand.id, participantId: participant.id,
      provider: account.platform, providerConversationId: `manual:${event.id}`, source: 'MANUAL', type,
      firstMessageAt: event.createdAt, lastMessageAt: event.createdAt
    } });
    await tx.socialMessage.create({ data: { workspaceId, conversationId: conversation.id, providerMessageId: `manual:${event.id}`, direction: 'INBOUND', sender: name, text, sentAt: event.createdAt } });
    await tx.inboxEvent.update({ where: { id: event.id }, data: { status: 'DONE', processedAt: now, conversationId: conversation.id, payload: '{}' } });
    await tx.notification.create({ data: { workspaceId, userId: actor.id, type: 'INBOX', title: 'Etkileşim gelen kutusuna eklendi', message: 'Elle eklediğiniz kayıt işlenmeye hazır.', actionLabel: 'Konuşmayı Aç', actionRoute: `/app/gelen-kutusu?conversation=${conversation.id}` } });
    await tx.auditLog.create({ data: { workspaceId, userId: actor.id, action: 'conversation.created', entityType: 'SocialConversation', entityId: conversation.id, metadata: JSON.stringify({ source: 'MANUAL', eventId: event.id }) } });
    return { conversationId: conversation.id, duplicate: false };
  });
}

export async function updateConversation(actor: Actor, id: string, body: Record<string, unknown>) {
  await authorizeInbox(actor, true);
  if (!Number.isInteger(body.version)) throw new InboxError('INVALID_INPUT', 'Kayıt sürümü gerekli.');
  const action = inputText(body.action, 'İşlem', 30);
  return prisma.$transaction(async tx => {
    const conversation = await tx.socialConversation.findFirst({ where: { id, workspaceId: actor.workspaceId } });
    if (!conversation) throw missing();
    const workspaceId = actor.workspaceId;
    if (conversation.version !== body.version) throw new InboxError('CONFLICT', 'Konuşma başka bir işlemle değişti. Yenileyip tekrar deneyin.', 409);
    const data: Prisma.SocialConversationUpdateManyMutationInput = { version: { increment: 1 } };
    let metadata: Record<string, unknown> = {};
    if (action === 'status') {
      const status = enumInput(CONVERSATION_STATUSES, body.value);
      data.status = status;
      data.resolvedAt = status === 'RESOLVED' ? (conversation.resolvedAt ?? new Date()) : null;
      metadata = { from: conversation.status, to: status };
    } else if (action === 'priority') {
      data.priority = enumInput(PRIORITIES, body.value);
      metadata = { from: conversation.priority, to: data.priority };
    } else if (action === 'assign') {
      const assignedTo = body.value === null ? null : inputText(body.value, 'Atanan kişi', 100);
      if (assignedTo && !await tx.user.findFirst({ where: { id: assignedTo, workspaceId, isActive: true } })) throw missing();
      data.assignedTo = assignedTo;
      await tx.conversationAssignment.create({ data: { workspaceId, conversationId: id, assignedBy: actor.id, assignedTo } });
      if (assignedTo && assignedTo !== conversation.assignedTo) await tx.notification.create({ data: {
        workspaceId, userId: assignedTo, type: 'INBOX', title: 'Size bir konuşma atandı', message: 'Gelen kutusunda atanan konuşmayı inceleyin.', actionLabel: 'Konuşmayı Aç', actionRoute: `/app/gelen-kutusu?conversation=${id}`
      } });
      metadata = { from: conversation.assignedTo, to: assignedTo };
    } else if (action === 'read') {
      await tx.socialMessage.updateMany({ where: { workspaceId, conversationId: id, direction: 'INBOUND', isRead: false }, data: { isRead: true } });
    } else if (action === 'tag') {
      const name = inputText(body.value, 'Etiket', 40);
      if (await tx.conversationTag.count({ where: { conversationId: id } }) >= 20) throw new InboxError('LIMIT', 'Bir konuşmada en fazla 20 etiket olabilir.');
      await tx.conversationTag.upsert({ where: { conversationId_name: { conversationId: id, name } }, create: { workspaceId, conversationId: id, name }, update: {} });
    } else if (action === 'removeTag') {
      await tx.conversationTag.deleteMany({ where: { workspaceId, conversationId: id, name: inputText(body.value, 'Etiket', 40) } });
    } else if (action === 'note') {
      const text = inputText(body.value, 'İç not', 5000);
      if (await tx.socialMessage.count({ where: { workspaceId, conversationId: id } }) >= 500) throw new InboxError('LIMIT', 'Bu konuşmanın mesaj sınırına ulaşıldı.');
      const ids = body.mentionUserIds ?? [];
      if (!Array.isArray(ids) || ids.length > 10 || ids.some(x => typeof x !== 'string')) throw new InboxError('INVALID_INPUT', 'En fazla 10 ekip üyesinden bahsedebilirsiniz.');
      const distinct = Array.from(new Set(ids as string[]));
      const users = await tx.user.findMany({ where: { id: { in: distinct }, workspaceId, isActive: true }, select: { id: true } });
      if (users.length !== distinct.length) throw missing();
      await tx.socialMessage.create({ data: { workspaceId, conversationId: id, direction: 'INTERNAL', messageType: 'NOTE', providerMessageId: `note:${randomUUID()}`, sender: actor.name, text, sentAt: new Date(), isRead: true } });
      for (const user of users) await tx.notification.create({ data: { workspaceId, userId: user.id, type: 'INBOX', title: 'Bir iç notta sizden bahsedildi', message: 'Ekip içi notu Gelen Kutusu üzerinden inceleyin.', actionLabel: 'Konuşmayı Aç', actionRoute: `/app/gelen-kutusu?conversation=${id}` } });
      // No note text / PII in audit metadata or notification body.
      metadata = { mentions: users.length };
    } else if (action === 'reply') {
      throw new InboxError('API_LIMITATION', 'API KISITLAMASI — Bu hesapta sosyal ağa yanıt gönderme etkin değil. Platformun resmî uygulamasından yanıtlayın.', 422);
    } else throw new InboxError('INVALID_INPUT', 'Geçersiz işlem.');
    const changed = await tx.socialConversation.updateMany({ where: { id, workspaceId, version: conversation.version }, data });
    if (changed.count !== 1) throw new InboxError('CONFLICT', 'Konuşma değişti. Lütfen yenileyin.', 409);
    await tx.auditLog.create({ data: { workspaceId, userId: actor.id, action: `conversation.${action}`, entityType: 'SocialConversation', entityId: id, metadata: JSON.stringify(metadata) } });
    return { id, version: conversation.version + 1 };
  });
}
