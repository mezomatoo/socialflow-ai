import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isFeatureEnabled } from '@/lib/brandkit/featureFlags';
import { inboxOptions } from '@/lib/inbox/service';
import { unavailableEngagement } from '@/lib/social/engagement';
import { InboxView } from './InboxView';
export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect('/giris');
  if (!isFeatureEnabled('unifiedInbox')) notFound();
  return <InboxView options={await inboxOptions(session.user)} capabilities={unavailableEngagement()} />;
}
