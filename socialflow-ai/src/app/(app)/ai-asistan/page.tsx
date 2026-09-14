import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { getAppBranding } from '@/lib/settings/appSettings';
import { AssistantView } from './AssistantView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI İçerik Asistanı' };

export default async function AssistantPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const ws = session.user.workspaceId;

  const [brands, branding] = await Promise.all([
    prisma.brand.findMany({ where: { workspaceId: ws }, orderBy: { name: 'asc' }, select: { id: true, name: true, defaultStyle: true } }),
    getAppBranding(ws)
  ]);

  return (
    <AssistantView
      brands={JSON.parse(JSON.stringify(brands))}
      aiProvider={branding.aiProvider}
      demoMode={session.user.demoMode}
      timezone={session.user.timezone}
    />
  );
}
