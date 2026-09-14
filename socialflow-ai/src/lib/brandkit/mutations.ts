import prisma from '../prisma';
import { audit } from '../security/audit';
import { ForbiddenError, type SessionContext } from '../auth/session';
import { ensureBrandKit, recomputeCompleteness } from './service';
import { canBrandKit, BRAND_KIT_PERMISSION_LABELS } from './permissions';
import type { CollectionDef, FieldDef } from './collections';

/**
 * PHASE 4 — Brand Kit genel koleksiyon mutasyonları
 * ---------------------------------------------------------------------------
 * create/update/delete işlemlerini TEK yerde toplar: workspace izolasyonu,
 * marka kilidi (§41-§42), alan doğrulama/coercion, doluluk skoru güncelleme ve
 * denetim kaydı. Route'lar ince kalır; tüm güvenlik kuralları burada uygulanır.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Kayıt bulunamadı.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

function coerce(field: FieldDef, raw: unknown): unknown {
  if (raw === undefined) return undefined;
  switch (field.type) {
    case 'int': {
      if (raw === null || raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'boolean':
      return raw === true || raw === 'true' || raw === 1 || raw === '1';
    case 'tags': {
      const arr = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,\n]+/);
      const clean = arr.map((s) => String(s).trim()).filter(Boolean);
      return JSON.stringify(clean);
    }
    default: {
      // string | text | color | select
      if (raw === null) return null;
      const s = String(raw);
      return s === '' ? null : s;
    }
  }
}

function buildData(def: CollectionDef, body: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of def.fields) {
    const present = f.name in body;
    const raw = present ? body[f.name] : undefined;
    if (f.required) {
      // Gönderilip boş bırakıldıysa her zaman reddet.
      if (present && (raw === null || raw === undefined || String(raw).trim() === '')) {
        throw new ValidationError(`${f.label} alanı zorunludur.`);
      }
      // Hiç gönderilmediyse yalnızca CREATE (partial=false) sırasında reddet.
      if (!present && !partial) {
        throw new ValidationError(`${f.label} alanı zorunludur.`);
      }
    }
    if (!present) continue;
    if (f.type === 'int' && raw !== null && raw !== '' && !Number.isFinite(Number(raw))) {
      throw new ValidationError(`${f.label} sayısal olmalıdır.`);
    }
    data[f.name] = coerce(f, raw);
  }
  return data;
}

/** Marka kilidi + yetki kurallarını uygular. */
export function assertKitEditable(session: SessionContext, lockMode: string, def: CollectionDef): void {
  if (!canBrandKit(session.user.role, def.perm)) {
    throw new ForbiddenError(
      `Bu işlem için yetkiniz yok. Gerekli yetki: ${BRAND_KIT_PERMISSION_LABELS[def.perm]}.`
    );
  }
  const role = session.user.role;
  const isManager = role === 'OWNER' || role === 'ADMIN';
  if (lockMode === 'STRICT' && !isManager) {
    throw new ForbiddenError('Marka kilidi KATI modda. Çekirdek marka kitini yalnızca Sahip veya Yönetici düzenleyebilir.');
  }
  if (lockMode === 'STANDARD' && def.lockSensitive && !isManager) {
    throw new ForbiddenError('Marka kilidi STANDART modda. Bu çekirdek kimlik bölümünü yalnızca Sahip veya Yönetici düzenleyebilir.');
  }
}

function delegate(def: CollectionDef): any {
  return (prisma as any)[def.delegate];
}

export async function createItem(
  session: SessionContext,
  brandId: string,
  def: CollectionDef,
  body: Record<string, unknown>,
  request?: Request
) {
  const kit = await ensureBrandKit({ workspaceId: session.user.workspaceId, brandId });
  if (!kit) throw new NotFoundError('Marka bulunamadı.');
  assertKitEditable(session, kit.lockMode, def);

  const data = buildData(def, body, false);
  if (def.hasOrder && data.order === undefined) {
    const last = await delegate(def).findFirst({
      where: { brandKitId: kit.id },
      orderBy: { order: 'desc' },
      select: { order: true }
    });
    data.order = (last?.order ?? -1) + 1;
  }

  const created = await delegate(def).create({
    data: { ...data, workspaceId: session.user.workspaceId, brandId, brandKitId: kit.id }
  });

  await recomputeCompleteness(kit.id);
  await audit({
    workspaceId: session.user.workspaceId,
    userId: session.user.id,
    action: `brandkit.${def.key}.create`,
    entityType: def.delegate,
    entityId: created.id,
    metadata: { brandId },
    request
  });
  return created;
}

export async function updateItem(
  session: SessionContext,
  brandId: string,
  def: CollectionDef,
  itemId: string,
  body: Record<string, unknown>,
  request?: Request
) {
  const kit = await ensureBrandKit({ workspaceId: session.user.workspaceId, brandId });
  if (!kit) throw new NotFoundError('Marka bulunamadı.');
  assertKitEditable(session, kit.lockMode, def);

  const existing = await delegate(def).findFirst({
    where: { id: itemId, brandKitId: kit.id, workspaceId: session.user.workspaceId },
    select: { id: true }
  });
  if (!existing) throw new NotFoundError('Kayıt bulunamadı.');

  const data = buildData(def, body, true);
  const updated = await delegate(def).update({ where: { id: itemId }, data });

  await recomputeCompleteness(kit.id);
  await audit({
    workspaceId: session.user.workspaceId,
    userId: session.user.id,
    action: `brandkit.${def.key}.update`,
    entityType: def.delegate,
    entityId: itemId,
    metadata: { brandId, fields: Object.keys(data) },
    request
  });
  return updated;
}

export async function deleteItem(
  session: SessionContext,
  brandId: string,
  def: CollectionDef,
  itemId: string,
  request?: Request
) {
  const kit = await ensureBrandKit({ workspaceId: session.user.workspaceId, brandId });
  if (!kit) throw new NotFoundError('Marka bulunamadı.');
  assertKitEditable(session, kit.lockMode, def);

  const existing = await delegate(def).findFirst({
    where: { id: itemId, brandKitId: kit.id, workspaceId: session.user.workspaceId },
    select: { id: true }
  });
  if (!existing) throw new NotFoundError('Kayıt bulunamadı.');

  await delegate(def).delete({ where: { id: itemId } });

  await recomputeCompleteness(kit.id);
  await audit({
    workspaceId: session.user.workspaceId,
    userId: session.user.id,
    action: `brandkit.${def.key}.delete`,
    entityType: def.delegate,
    entityId: itemId,
    metadata: { brandId },
    request
  });
  return { deleted: true };
}
