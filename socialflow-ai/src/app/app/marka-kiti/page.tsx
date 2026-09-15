import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { listBrandKitsForWorkspace } from '@/lib/brandkit/service';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { BrandKitHub } from './BrandKitHub';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marka Kiti' };

export default async function BrandKitHubPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Faz kapısı (§3): modül kapalıysa çalışıyormuş gibi gösterilmez.
  if (!isModuleEnabled('creativeStudio')) {
    return <PhaseGateNotice module="creativeStudio" phase1Alternatives={[{ href: '/app/markalar', label: 'Markalar' }]} />;
  }

  const brands = await listBrandKitsForWorkspace(session.user.workspaceId);
  return <BrandKitHub items={JSON.parse(JSON.stringify(brands))} demoMode={session.user.demoMode} />;
}
