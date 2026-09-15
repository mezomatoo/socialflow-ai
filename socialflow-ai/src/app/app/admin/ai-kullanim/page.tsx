import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ModuleUnavailableNotice } from '@/components/ui/PhaseNotice';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Kullanımı · SocialFlow AI' };

export default async function AiUsagePage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Kullanım ölçümü henüz gerçek veriye bağlı değil; sahte metrik
  // müşteriye gösterilmez (§30: sahte başarı yasak).
  return (
    <ModuleUnavailableNotice
      title="AI Kullanımı"
      message="AI kullanım raporu bu kurulumda henüz etkin değil; şu an için doğru veri gösterilemez."
      alternatives={[{ href: '/app/ayarlar', label: 'Ayarlar' }]}
    />
  );
}
