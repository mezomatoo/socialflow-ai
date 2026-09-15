import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { getAppBranding } from '@/lib/settings/appSettings';
import { getAllRules } from '@/lib/rules/ruleEngine';
import { SettingsView } from './SettingsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ayarlar' };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const ws = session.user.workspaceId;

  const [branding, settings, rules, integrations, workspace] = await Promise.all([
    getAppBranding(ws),
    prisma.appSettings.findUnique({ where: { workspaceId: ws } }),
    getAllRules(ws),
    prisma.providerIntegration.findMany({ where: { workspaceId: ws } }),
    prisma.workspace.findUnique({ where: { id: ws }, select: { name: true, slug: true, plan: true, timezone: true, locale: true } })
  ]);

  return (
    <SettingsView
      role={session.user.role}
      workspace={JSON.parse(JSON.stringify(workspace))}
      branding={JSON.parse(JSON.stringify(branding))}
      settings={JSON.parse(JSON.stringify(settings))}
      rules={JSON.parse(JSON.stringify(rules.map((r) => ({ ...r, lastUpdatedAt: new Date(r.lastUpdatedAt).toISOString() }))))}
      integrations={JSON.parse(JSON.stringify(integrations))}
    />
  );
}
