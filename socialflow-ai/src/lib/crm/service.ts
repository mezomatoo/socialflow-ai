import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import type { SessionContext } from '../auth/session';
import { BusinessError, businessActor, fields, text, revision, missing, conflict, WRITE_ROLES } from '../business/access';
import { isFeatureEnabled } from '../brandkit/featureFlags';
export const LEAD_STAGES = ['NEW', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'] as const;
export const STAGE_LABELS: Record<string, string> = { NEW: 'Yeni', QUALIFIED: 'Nitelikli', PROPOSAL: 'Teklif', WON: 'Kazanıldı', LOST: 'Kaybedildi' };
async function actor(session: SessionContext, write = false, lead = false) {
  const user = await businessActor(session, 'socialCRM', write);
  if (lead && !isFeatureEnabled('leadManagement')) throw new BusinessError('FEATURE_DISABLED', 'Potansiyel müşteri modülü kapalı.', 404);
  return user;
}
function contactInput(input: Record<string, unknown>) {
  const name = text(input.name, 'Kişi adı'), email = text(input.email, 'E-posta', 254, true).toLowerCase() || null, phone = text(input.phone, 'Telefon', 40, true) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BusinessError('INVALID_INPUT', 'Geçersiz e-posta.');
  if (phone && !/^\+?[0-9 ()-]{5,40}$/.test(phone)) throw new BusinessError('INVALID_INPUT', 'Geçersiz telefon.');
  return { name, email, phone };
}
async function audit(tx: Prisma.TransactionClient, workspaceId: string, userId: string, action: string, id: string, metadata: unknown = {}) {
  await tx.auditLog.create({ data: { workspaceId, userId, action, entityType: 'CRM', entityId: id, metadata: JSON.stringify(metadata) } });
}
export async function crmOptions(session: SessionContext) {
  const u = await actor(session);
  const [brands, users, campaigns, conversations] = await Promise.all([
    prisma.brand.findMany({ where: { workspaceId: u.workspaceId }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { workspaceId: u.workspaceId, isActive: true }, select: { id: true, name: true } }),
    prisma.campaign.findMany({ where: { workspaceId: u.workspaceId }, select: { id: true, name: true }, take: 100, orderBy: { createdAt: 'desc' } }),
    prisma.socialConversation.findMany({ where: { workspaceId: u.workspaceId, contactLink: null }, select: { id: true, brandId: true, participant: { select: { displayName: true } }, provider: true }, orderBy: { lastMessageAt: 'desc' }, take: 100 })
  ]);
  return { canWrite: WRITE_ROLES.includes(u.role), leadsEnabled: isFeatureEnabled('leadManagement'), brands, users, campaigns, conversations };
}
export async function listContacts(session: SessionContext, params = new URLSearchParams()) {
  const u = await actor(session), q = params.get('q') || '', brandId = params.get('brand') || '', status = params.get('status') || 'ACTIVE', raw = params.get('page') || '1';
  if (q.length > 100 || !['ACTIVE','ARCHIVED'].includes(status) || !/^\d{1,4}$/.test(raw) || +raw < 1) throw new BusinessError('INVALID_INPUT', 'Geçersiz filtre.');
  const where = { workspaceId: u.workspaceId, status, ...(brandId ? { brandId } : {}), ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q.toLowerCase() } }] } : {}) };
  const [items,total] = await Promise.all([prisma.contact.findMany({ where, include: { brand: { select: { name: true } }, _count: { select: { leads: true, conversations: true } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (+raw - 1) * 20, take: 20 }), prisma.contact.count({ where })]); return { items,total,page: +raw };
}
export async function getContact(session: SessionContext, id: string) {
  const u = await actor(session);
  const c = await prisma.contact.findFirst({ where: { workspaceId: u.workspaceId, id }, include: { brand: { select: { name: true } }, leads: { orderBy: { updatedAt: 'desc' }, take: 100, include: { owner: { select: { name: true } }, campaign: { select: { name: true } }, activities: { orderBy: { createdAt: 'desc' }, take: 30 } } }, conversations: { select: { id: true, conversationId: true, conversation: { select: { provider: true, status: true } } }, take: 100 } } });
  if (!c) missing();
  return { ...c, leads: isFeatureEnabled('leadManagement') ? c.leads : [] };
}
export async function createContact(session: SessionContext, input: Record<string, unknown>) {
  const u = await actor(session,true); fields(input,['brandId','name','email','phone','lawfulBasisConfirmed']);
  if (input.lawfulBasisConfirmed !== true) throw new BusinessError('CONFIRMATION_REQUIRED', 'Kişisel veriyi kaydetmek için hukuki dayanağınız olduğunu doğrulayın.');
  const data = contactInput(input), brandId = text(input.brandId,'Marka',100);
  return prisma.$transaction(async tx => {
    if (!await tx.brand.findFirst({ where: { id: brandId, workspaceId: u.workspaceId } })) missing();
    const c = await tx.contact.create({ data: { ...data, workspaceId: u.workspaceId, brandId } });
    await audit(tx,u.workspaceId,u.id,'crm.contact.created',c.id,{ source: 'USER_PROVIDED', lawfulBasisConfirmed: true }); return { id: c.id };
  });
}
export async function updateContact(session: SessionContext, id: string, input: Record<string, unknown>) {
  const u = await actor(session,true); fields(input,['name','email','phone','status','version']); const data = contactInput(input), version = revision(input.version);
  if (!['ACTIVE','ARCHIVED'].includes(input.status as string)) throw new BusinessError('INVALID_INPUT','Geçersiz kişi durumu.');
  return prisma.$transaction(async tx => {
    const c = await tx.contact.findFirst({ where: { id, workspaceId: u.workspaceId } }); if (!c) missing();
    if ((await tx.contact.updateMany({ where: { id, workspaceId: u.workspaceId, version }, data: { ...data,status: input.status as string,version:{increment:1} } })).count !== 1) conflict();
    await audit(tx,u.workspaceId,u.id,'crm.contact.updated',id,{ version:version+1, status:input.status }); return {id};
  });
}
export async function linkConversation(session: SessionContext, id: string, input: Record<string, unknown>) {
  const u = await actor(session,true); fields(input,['conversationId','version']); const conversationId = text(input.conversationId,'Konuşma',100), version = revision(input.version);
  return prisma.$transaction(async tx => {
    const c = await tx.contact.findFirst({ where: { id,workspaceId:u.workspaceId } }); if (!c) missing();
    if (c.status !== 'ACTIVE') throw new BusinessError('ARCHIVED','Arşivlenmiş kişi bağlanamaz.',409);
    const conv = await tx.socialConversation.findFirst({where:{id:conversationId,workspaceId:u.workspaceId,brandId:c.brandId}}); if (!conv) missing();
    if ((await tx.contact.updateMany({where:{id,workspaceId:u.workspaceId,version},data:{version:{increment:1}}})).count !== 1) conflict();
    await tx.contactConversationLink.create({data:{workspaceId:u.workspaceId,contactId:id,conversationId,actorId:u.id}});
    await audit(tx,u.workspaceId,u.id,'crm.conversation.linked',id,{conversationId}); return {id};
  });
}
export async function unlinkConversation(session: SessionContext, id: string, input: Record<string, unknown>) {
  const u = await actor(session,true); fields(input,['conversationId','version']); const conversationId = text(input.conversationId,'Konuşma',100), version=revision(input.version);
  return prisma.$transaction(async tx=>{
    if (!await tx.contact.findFirst({where:{id,workspaceId:u.workspaceId}})) missing();
    if ((await tx.contact.updateMany({where:{id,workspaceId:u.workspaceId,version},data:{version:{increment:1}}})).count !== 1) conflict();
    if ((await tx.contactConversationLink.deleteMany({where:{contactId:id,workspaceId:u.workspaceId,conversationId}})).count !== 1) missing();
    await audit(tx,u.workspaceId,u.id,'crm.conversation.unlinked',id,{conversationId}); return {id};
  });
}
async function leadRelations(tx: Prisma.TransactionClient, workspaceId: string, input: Record<string, unknown>) {
  const ownerId = input.ownerId === null ? null : text(input.ownerId,'Sorumlu',100), campaignId = input.campaignId === null ? null : text(input.campaignId,'Kampanya',100);
  if (ownerId && !await tx.user.findFirst({where:{id:ownerId,workspaceId,isActive:true}})) missing();
  if (campaignId && !await tx.campaign.findFirst({where:{id:campaignId,workspaceId}})) missing(); return {ownerId,campaignId};
}
export async function createLead(session: SessionContext, contactId: string, input: Record<string, unknown>) {
  const u = await actor(session,true,true);fields(input,['title','ownerId','campaignId']);const title=text(input.title,'Fırsat başlığı');
  return prisma.$transaction(async tx=>{
    const c = await tx.contact.findFirst({where:{id:contactId,workspaceId:u.workspaceId}});if(!c)missing();
    if(c.status!=='ACTIVE')throw new BusinessError('ARCHIVED','Arşivlenmiş kişi için fırsat açılamaz.',409);
    if(await tx.lead.count({where:{workspaceId:u.workspaceId,contactId}})>=100)throw new BusinessError('LIMIT','Bu sürümde kişi başına 100 fırsat desteklenir.');
    const relations=await leadRelations(tx,u.workspaceId,input);
    const l=await tx.lead.create({data:{workspaceId:u.workspaceId,contactId,title,...relations}});
    await tx.leadActivity.create({data:{workspaceId:u.workspaceId,leadId:l.id,actorId:u.id,type:'CREATED',text:'Fırsat elle oluşturuldu.'}});
    await audit(tx,u.workspaceId,u.id,'crm.lead.created',l.id,{contactId});return{id:l.id};
  });
}
export async function updateLead(session: SessionContext,id:string,input:Record<string,unknown>) {
  const u=await actor(session,true,true);fields(input,['title','stage','ownerId','campaignId','version','reason']);const version=revision(input.version),title=text(input.title,'Başlık'),reason=text(input.reason,'Değişiklik gerekçesi',1000);
  if(!LEAD_STAGES.includes(input.stage as typeof LEAD_STAGES[number]))throw new BusinessError('INVALID_INPUT','Geçersiz satış aşaması.');
  return prisma.$transaction(async tx=>{
    const l=await tx.lead.findFirst({where:{id,workspaceId:u.workspaceId},include:{contact:true}});if(!l)missing();
    if(l.contact.status!=='ACTIVE')throw new BusinessError('ARCHIVED','Arşivlenmiş kişinin fırsatı değiştirilemez.',409);
    const relations=await leadRelations(tx,u.workspaceId,input);
    if((await tx.lead.updateMany({where:{id,workspaceId:u.workspaceId,version},data:{title,stage:input.stage as string,...relations,version:{increment:1}}})).count!==1)conflict();
    await tx.leadActivity.create({data:{workspaceId:u.workspaceId,leadId:id,actorId:u.id,type:'UPDATED',text:`${STAGE_LABELS[l.stage]} → ${STAGE_LABELS[input.stage as string]}: ${reason}`}});
    await audit(tx,u.workspaceId,u.id,'crm.lead.updated',id,{oldStage:l.stage,stage:input.stage,version:version+1});return{id};
  });
}
export async function addLeadNote(session:SessionContext,id:string,input:Record<string,unknown>) {
  const u=await actor(session,true,true);fields(input,['text']);const note=text(input.text,'İç not',2000);
  return prisma.$transaction(async tx=>{
    const l=await tx.lead.findFirst({where:{id,workspaceId:u.workspaceId},include:{contact:true}});if(!l)missing();
    if(l.contact.status!=='ACTIVE')throw new BusinessError('ARCHIVED','Arşivlenmiş kayda not eklenemez.',409);
    const n=await tx.leadActivity.create({data:{workspaceId:u.workspaceId,leadId:id,actorId:u.id,type:'INTERNAL_NOTE',text:note}});
    await audit(tx,u.workspaceId,u.id,'crm.lead.note_added',id,{noteId:n.id});return{id:n.id};
  });
}
type Wire<T> = T extends Date ? string : T extends Array<infer U> ? Wire<U>[] : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;
export type ContactDetail=Wire<Awaited<ReturnType<typeof getContact>>>;
export type ContactList=Wire<Awaited<ReturnType<typeof listContacts>>>;
export type CrmOptions=Awaited<ReturnType<typeof crmOptions>>;
