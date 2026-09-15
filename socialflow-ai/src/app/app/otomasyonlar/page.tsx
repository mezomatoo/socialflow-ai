import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { AutomationsView } from './AutomationsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Otomasyonlar' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Kapı (§3): otomasyon motoru henüz sahte (mock) yürütme kullanıyor; müşteriye
  // çalışıyormuş gibi gösterilmez.
  if (!isModuleEnabled('automation')) {
    return (
      <PhaseGateNotice
        module="automation"
        phase1Alternatives={[{ href: '/app/icerik/planlananlar', label: 'Planlananlar' }]}
      />
    );
  }
  return <AutomationsView demoMode={session.user.demoMode} />;
}
