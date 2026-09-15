import prisma from '../prisma';
import { hasRole, type SessionContext } from '../auth/session';
import { PLATFORMS, type PlatformCode } from '../platforms/platforms';
export class AccountRegistrationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function text(value: unknown, max: number, required = true): string {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) throw new AccountRegistrationError('Hesap bilgileri eksik veya geçersiz.');
  return value.trim();
}
/** Register a local account target; ONLY OAuth can claim real connection/scopes/external identity. */
export async function registerAccount(session: SessionContext, input: Record<string, unknown>) {
  const user = await prisma.user.findFirst({ where: { id: session.user.id, workspaceId: session.user.workspaceId, isActive: true }, include: { workspace: true } });
  if (!user || !hasRole(user.role, 'EDITOR')) throw new AccountRegistrationError('Hesap eklemek için yetkiniz yok.', 403);
  const platform = text(input.platform, 40) as PlatformCode;
  if (!PLATFORMS.includes(platform)) throw new AccountRegistrationError('Desteklenmeyen platform.');
  let handle = text(input.handle, 100);
  if (platform === 'INSTAGRAM') {
    handle = '@' + handle.replace(/^@/, '').toLowerCase();
    if (!/^@[a-z0-9_.]+$/.test(handle)) throw new AccountRegistrationError('Instagram kullanıcı adını bağlantı adresi olmadan girin.');
  }
  const displayName = text(input.displayName, 150, false) || handle;
  const brandId = text(input.brandId, 100, false) || null;
  const accountType = input.accountType == null ? 'PROFILE' : text(input.accountType, 30);
  if (!['PROFILE', 'PAGE', 'BUSINESS', 'CREATOR', 'CHANNEL', 'GROUP'].includes(accountType)) throw new AccountRegistrationError('Geçersiz hesap türü.');
  const demoAccount = user.workspace.demoMode;
  return prisma.$transaction(async tx => {
    if (brandId && !await tx.brand.findFirst({ where: { id: brandId, workspaceId: user.workspaceId } })) throw new AccountRegistrationError('Marka bulunamadı.', 404);
    const existing = await tx.socialAccount.findFirst({ where: { workspaceId: user.workspaceId, platform, handle } });
    if (existing) throw new AccountRegistrationError('Bu hesap zaten eklenmiş.', 409);
    const account = await tx.socialAccount.create({ data: { workspaceId: user.workspaceId, brandId, platform, handle, displayName, accountType,
      demoAccount, connectionStatus: demoAccount ? 'ACTIVE' : 'NEEDS_REAUTH', scopes: '', externalId: null } });
    await tx.auditLog.create({ data: { workspaceId: user.workspaceId, userId: user.id, action: 'account.registered', entityType: 'SocialAccount', entityId: account.id, metadata: JSON.stringify({ platform, demo: demoAccount }) } });
    return { id: account.id, demoAccount: account.demoAccount, connectionStatus: account.connectionStatus, handle: account.handle };
  });
}
