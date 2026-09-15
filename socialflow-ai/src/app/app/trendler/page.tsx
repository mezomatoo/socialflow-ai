import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { TrendsView } from './TrendsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Trendler' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Kapı (§3): canlı trendler lisanslı sağlayıcıya bağlanmadan çalışıyormuş
  // gibi gösterilmez; demo verisi müşteri menüsüne sunulmaz.
  if (!isModuleEnabled('listening')) {
    return (
      <PhaseGateNotice
        module="listening"
        phase1Alternatives={[{ href: '/app/ai-planlayici', label: 'AI İçerik Planlayıcı' }]}
      />
    );
  }
  return <TrendsView />;
}
