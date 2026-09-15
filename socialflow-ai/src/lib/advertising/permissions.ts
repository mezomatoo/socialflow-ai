import type { Role } from '../platforms/platforms';
import { AdvertisingError } from './contracts';
export const AD_PERMISSIONS = [
  'ads:view', 'ads:create', 'ads:edit', 'ads:submit', 'ads:publish', 'ads:pause',
  'ads:budget_edit', 'ads:targeting_edit', 'ads:analytics', 'ads:accounts_manage'
] as const;
export type AdPermission = typeof AD_PERMISSIONS[number];
const READERS: Role[] = ['OWNER', 'ADMIN', 'EDITOR', 'CREATOR', 'APPROVER', 'VIEWER'];
const EDITORS: Role[] = ['OWNER', 'ADMIN', 'EDITOR', 'CREATOR'];
const ADMINS: Role[] = ['OWNER', 'ADMIN'];
const PERMISSIONS: Record<AdPermission, Role[]> = {
  'ads:view': READERS, 'ads:analytics': READERS,
  'ads:create': EDITORS, 'ads:edit': EDITORS,
  'ads:submit': ADMINS, 'ads:publish': ADMINS,
  'ads:pause': ['OWNER', 'ADMIN', 'EDITOR'],
  'ads:budget_edit': ADMINS, 'ads:targeting_edit': ['OWNER', 'ADMIN', 'EDITOR'],
  'ads:accounts_manage': ADMINS
};
export function canAdvertising(role: string, permission: AdPermission) {
  return PERMISSIONS[permission]?.includes(role as Role) ?? false;
}
/** Stage A hard gate: an env flag alone must NEVER enable a financial operation. */
export function rejectFinancialWrite(): never {
  throw new AdvertisingError('PAID_MEDIA_WRITE_DISABLED', 'Reklam gönderimi, etkinleştirme ve bütçe değişikliği bu aşamada kapalıdır. Harcama yapılamaz.', 403);
}
