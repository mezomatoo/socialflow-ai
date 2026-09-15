import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { catalogOptions } from '@/lib/catalog/service';
import { BusinessError } from '@/lib/business/access';
import { CatalogView } from './CatalogView';
export default async function CatalogPage() {
  const session = await getSession(); if (!session) redirect('/giris');
  try { return <CatalogView options={await catalogOptions(session)} />; }
  catch (e) { if (e instanceof BusinessError && [403,404].includes(e.status)) notFound(); throw e; }
}
