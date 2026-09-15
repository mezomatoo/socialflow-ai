import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { authorizeAdvertising } from '@/lib/advertising/service';
import { AdvertisingError } from '@/lib/advertising/contracts';
export async function advertisingPageSession() {
  const session = await getSession();
  if (!session) redirect('/giris');
  try { await authorizeAdvertising(session); }
  catch (e) { if (e instanceof AdvertisingError && [403, 404].includes(e.status)) notFound(); throw e; }
  return session;
}
