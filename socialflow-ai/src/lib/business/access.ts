import prisma from '../prisma';
import type { SessionContext } from '../auth/session';
import { isFeatureEnabled, type FeatureFlag } from '../brandkit/featureFlags';
export class BusinessError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export const READ_ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'CREATOR', 'APPROVER', 'VIEWER'];
export const WRITE_ROLES = ['OWNER', 'ADMIN', 'EDITOR'];
export async function businessActor(session: SessionContext, feature: FeatureFlag, write = false) {
  if (!isFeatureEnabled(feature)) throw new BusinessError('FEATURE_DISABLED', 'Bu modül kapalı.', 404);
  const actor = await prisma.user.findFirst({ where: { id: session.user.id, workspaceId: session.user.workspaceId, isActive: true } });
  if (!actor || !(write ? WRITE_ROLES : READ_ROLES).includes(actor.role)) throw new BusinessError('FORBIDDEN', 'Bu işlem için yetkiniz yok.', 403);
  return actor;
}
export function fields(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some(k => !allowed.includes(k))) throw new BusinessError('INVALID_INPUT', 'Desteklenmeyen alan.');
}
export function text(value: unknown, label: string, max = 200, optional = false): string {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BusinessError('INVALID_INPUT', `${label} geçerli olmalıdır (en fazla ${max} karakter).`);
  return value.trim();
}
export function revision(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new BusinessError('INVALID_INPUT', 'Kayıt sürümü gerekli.');
  return value as number;
}
export function missing(): never { throw new BusinessError('NOT_FOUND', 'Kayıt bulunamadı.', 404); }
export function conflict(): never { throw new BusinessError('CONFLICT', 'Kayıt değişti. Yenileyip tekrar deneyin.', 409); }
