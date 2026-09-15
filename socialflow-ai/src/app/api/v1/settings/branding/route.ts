import { apiRoute, ok } from '@/lib/api';
import prisma from '@/lib/prisma';
import { getAppBranding } from '@/lib/settings/appSettings';
import { assertRole } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';

export const GET = apiRoute(async (_request, { session }) => {
  const branding = await getAppBranding(session.user.workspaceId);
  const settings = await prisma.appSettings.findUnique({ where: { workspaceId: session.user.workspaceId } });
  return ok({ branding, settings });
});

/** Uygulama adı, logo, renkler — Admin Ayarları. */
export const PATCH = apiRoute(
  async (request, { session }) => {
    assertRole(session, 'ADMIN');
    const body = await request.json().catch(() => ({}));
    const data: any = {};
    for (const key of ['appName', 'logoMark', 'logoUrl', 'primaryColor', 'secondaryColor', 'accentColor', 'radius', 'fontFamily', 'defaultLanguage', 'defaultTimezone', 'aiProvider', 'aiModel']) {
      if (body[key] !== undefined) data[key] = body[key] === null ? null : String(body[key]);
    }
    if (body.demoBanner !== undefined) data.demoBanner = Boolean(body.demoBanner);

    const settings = await prisma.appSettings.upsert({
      where: { workspaceId: session.user.workspaceId },
      create: { workspaceId: session.user.workspaceId, ...data },
      update: data
    });

    if (body.demoMode !== undefined) {
      await prisma.workspace.update({ where: { id: session.user.workspaceId }, data: { demoMode: Boolean(body.demoMode) } });
    }

    await audit({ workspaceId: session.user.workspaceId, userId: session.user.id, action: 'settings.branding', metadata: { changed: Object.keys(body) }, request });
    return ok({ settings, branding: await getAppBranding(session.user.workspaceId) });
  },
  { limit: 30 }
);
