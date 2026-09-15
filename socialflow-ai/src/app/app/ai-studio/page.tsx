import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/phase/phaseGates';
import { PhaseGateNotice } from '@/components/ui/PhaseNotice';
import { AiStudioView } from './AiStudioView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Kreatif Stüdyo' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  // Kapı (§3): kreatif stüdyo üretim motoru gerçek sağlayıcıya bağlanmadan
  // çalışıyormuş gibi gösterilmez; sahte görsel üretimi müşteriye sunulmaz.
  if (!isModuleEnabled('creativeStudio')) {
    return (
      <PhaseGateNotice
        module="creativeStudio"
        phase1Alternatives={[
          { href: '/app/medya', label: 'Medya Kütüphanesi' },
          { href: '/app/ai-asistan', label: 'AI İçerik Asistanı' }
        ]}
      />
    );
  }
  const ws = session.user.workspaceId;
  const brands: any[] = await prisma.brand.findMany({ where: { workspaceId: ws }, orderBy: { name: 'asc' } }).catch(() => []);
  // prefetch kits for demo
  const kits: Record<string, any> = {};
  for (const b of brands) {
    try {
      const kit: any = await (prisma as any).brandKit?.findUnique?.({ where: { brandId: b.id }, include: { colors: true, brand: { include: { voice: true } } } });
      if (kit) kits[b.id] = { ...kit, colors: kit.colors ?? [], completenessScore: kit.completenessScore ?? 70 };
    } catch {}
  }
  // fallback mock if empty
  const safeBrands = brands.length ? brands : [
    { id: 'demo-brand-id', name: 'Kahve Dükkanı', description: 'Nitelikli kahve', primaryColor: '#6D28D9' },
    { id: 'demo-brand2-id', name: 'Aurora Tekstil', description: 'Sürdürülebilir moda', primaryColor: '#0EA5E9' },
  ];
  if (!kits['demo-brand-id']) kits['demo-brand-id'] = { colors: [{ id:'c1', name:'Mor', hex:'#6D28D9'},{id:'c2', name:'Mavi', hex:'#0EA5E9'}], brand: { voice: { bannedTerms: 'ucuz' } }, completenessScore: 84 };
  return <AiStudioView brands={JSON.parse(JSON.stringify(safeBrands))} brandKits={JSON.parse(JSON.stringify(kits))} demoMode={session.user.demoMode} />;
}
