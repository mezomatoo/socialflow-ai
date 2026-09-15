import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { aiModeLabel } from '@/lib/ai/llmClient';
import { AiStudioView } from './AiStudioView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Stüdyo' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Kreatif stüdyo bu kurulumda kapalıysa sahte çalışma izlenimi verilmez.
  if (!isModuleEnabled('creativeStudio')) {
    return <PhaseGateNotice module="creativeStudio" phase1Alternatives={[{ href: '/app/markalar', label: 'Markalar' }]} />;
  }
  const brands = await prisma.brand.findMany({
    where: { workspaceId: session.user.workspaceId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, description: true }
  });

  return <AiStudioView brands={brands} aiMode={aiModeLabel()} demoMode={session.user.demoMode} />;
}
