import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { CompetitorView } from './CompetitorView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rakip Analizi' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Kapı (§3): rakip verileri resmî kaynaklara bağlanmadan çalışıyormuş
  // gibi gösterilmez; demo verisi müşteriye sunulmaz.
  if (!isModuleEnabled('listening')) {
    return (
      <PhaseGateNotice
        module="listening"
        phase1Alternatives={[{ href: '/app/analizler', label: 'Analizler' }]}
      />
    );
  }
  return <CompetitorView />;
}
