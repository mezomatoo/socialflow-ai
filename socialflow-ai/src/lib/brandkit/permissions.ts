import { ForbiddenError, type SessionContext } from '../auth/session';
import type { Role } from '../platforms/platforms';

/**
 * PHASE 4 — Brand Kit yetki modeli (§138)
 * ---------------------------------------------------------------------------
 * Roller lineer bir seviyeye sahip olsa da (VIEWER<...<OWNER), "approve" gibi
 * yetkiler APPROVER rolünü de kapsamalıdır. Bu yüzden minimum-seviye yerine
 * AÇIK rol kümeleri kullanılır. Mevcut auth/RBAC sistemi genişletilir; yeni bir
 * kimlik/rol sistemi OLUŞTURULMAZ.
 */

export const BRAND_KIT_PERMISSIONS = [
  'view',
  'edit',
  'approve',
  'lock',
  'export',
  'manage_assets'
] as const;
export type BrandKitPermission = (typeof BRAND_KIT_PERMISSIONS)[number];

export const BRAND_KIT_PERMISSION_LABELS: Record<BrandKitPermission, string> = {
  view: 'Marka kitini görüntüleme',
  edit: 'Marka kitini düzenleme',
  approve: 'Marka kiti değişikliklerini onaylama',
  lock: 'Marka kilidini yönetme',
  export: 'Marka kitini dışa aktarma',
  manage_assets: 'Marka dosyalarını yönetme'
};

const PERM_ROLES: Record<BrandKitPermission, Role[]> = {
  view: ['OWNER', 'ADMIN', 'EDITOR', 'CREATOR', 'APPROVER', 'VIEWER'],
  edit: ['OWNER', 'ADMIN', 'EDITOR'],
  approve: ['OWNER', 'ADMIN', 'APPROVER'],
  lock: ['OWNER', 'ADMIN'],
  export: ['OWNER', 'ADMIN', 'EDITOR', 'APPROVER'],
  manage_assets: ['OWNER', 'ADMIN', 'EDITOR']
};

/** Bir rol, verilen Brand Kit yetkisine sahip mi? */
export function canBrandKit(role: string, permission: BrandKitPermission): boolean {
  return PERM_ROLES[permission].includes(role as Role);
}

/** Yetki yoksa ForbiddenError fırlatır (apiRoute 403'e çevirir). */
export function assertBrandKit(session: SessionContext, permission: BrandKitPermission): void {
  if (!canBrandKit(session.user.role, permission)) {
    throw new ForbiddenError(
      `Bu işlem için yetkiniz yok. Gerekli yetki: ${BRAND_KIT_PERMISSION_LABELS[permission]}.`
    );
  }
}

/** Oturumun tüm Brand Kit yetkilerini döner (UI'da buton görünürlüğü için). */
export function brandKitPermissionsFor(role: string): Record<BrandKitPermission, boolean> {
  return BRAND_KIT_PERMISSIONS.reduce(
    (acc, p) => {
      acc[p] = canBrandKit(role, p);
      return acc;
    },
    {} as Record<BrandKitPermission, boolean>
  );
}
