import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ensureBrandKit } from '@/lib/brandkit/service';
import { computeCompleteness } from '@/lib/brandkit/completeness';
import { brandKitPermissionsFor } from '@/lib/brandkit/permissions';
import { featureFlagState } from '@/lib/brandkit/featureFlags';
import { BrandKitView } from './BrandKitView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marka Kiti' };

export default async function BrandKitEditorPage({ params }: { params: { brandId: string } }) {
  const session = await getSession();
  if (!session) redirect('/giris');

  const kit = await ensureBrandKit({ workspaceId: session.user.workspaceId, brandId: params.brandId });
  if (!kit) notFound();

  const data = {
    kit: JSON.parse(JSON.stringify(kit)),
    completeness: computeCompleteness(kit),
    permissions: brandKitPermissionsFor(session.user.role),
    flags: featureFlagState()
  };

  return (
    <BrandKitView
      brandId={params.brandId}
      initialData={JSON.parse(JSON.stringify(data))}
      demoMode={session.user.demoMode}
    />
  );
}
