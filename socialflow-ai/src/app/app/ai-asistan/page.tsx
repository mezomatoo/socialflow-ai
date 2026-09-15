import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { getAppBranding } from '@/lib/settings/appSettings';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { AssistantView } from './AssistantView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI İçerik Asistanı' };

export default async function AssistantPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Faz kapısı (§3): modül kapalıysa çalışıyormuş gibi gösterilmez.
  if (!isModuleEnabled('aiAssistant')) {
    return <PhaseGateNotice module="aiAssistant" phase1Alternatives={[{ href: '/app/icerik/yeni', label: 'Yeni İçerik' }]} />;
  }
  const ws = session.user.workspaceId;

  const [brands, branding] = await Promise.all([
    prisma.brand.findMany({ where: { workspaceId: ws }, orderBy: { name: 'asc' }, select: { id: true, name: true, defaultStyle: true } }),
    getAppBranding(ws)
  ]);

  return (
    <AssistantView
      brands={JSON.parse(JSON.stringify(brands))}
      aiProvider={branding.aiProvider}
      timezone={session.user.timezone}
    />
  );
}
