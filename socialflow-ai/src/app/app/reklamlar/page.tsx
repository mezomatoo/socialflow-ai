import { advertisingOverview } from '@/lib/advertising/service';
import { advertisingPageSession } from './session';
import { AdvertisingView } from './AdvertisingView';
export default async function AdvertisingPage() {
  const session = await advertisingPageSession();
  return <AdvertisingView overview={await advertisingOverview(session)} mode="overview" />;
}
