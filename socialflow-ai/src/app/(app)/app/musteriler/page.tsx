import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { crmOptions } from '@/lib/crm/service';
import { BusinessError } from '@/lib/business/access';
import { CrmView } from './CrmView';
export default async function CustomersPage() {
  const session = await getSession(); if (!session) redirect('/giris');
  try { return <CrmView options={await crmOptions(session)} />; }
  catch(e) { if(e instanceof BusinessError && [403,404].includes(e.status)) notFound(); throw e; }
}
