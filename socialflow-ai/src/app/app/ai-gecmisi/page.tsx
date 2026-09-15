import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ModuleUnavailableNotice } from '@/components/ui/PhaseNotice';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Geçmişi' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Üretim kayıtları henüz kalıcı saklamaya bağlı değil; sahte geçmiş
  // verisi müşteriye gösterilmez (§30: sahte başarı yasak).
  return (
    <ModuleUnavailableNotice
      title="AI Geçmişi"
      message="AI etkileşim geçmişi bu kurulumda henüz etkin değil. Ürettiğiniz metinler içeriklerinize kaydedilmeye devam ediyor."
      alternatives={[
        { href: '/app/ai-asistan', label: 'AI İçerik Asistanı' },
        { href: '/app/icerik/taslaklar', label: 'Taslaklar' }
      ]}
    />
  );
}
