import { NextResponse } from 'next/server';
import { apiRoute } from '@/lib/api';
import { AdvertisingError } from '@/lib/advertising/contracts';
import { completeGoogleAdsConnection } from '@/lib/advertising/googleAdsConnection';
import { audit } from '@/lib/security/audit';

/** Google Ads OAuth callback. Provider details and authorization codes never enter the redirect. */
export const GET = apiRoute(async (request, { session }) => {
  const query = new URL(request.url).searchParams;
  let result = 'connected';
  try {
    await completeGoogleAdsConnection(session, {
      state: query.get('state') || '',
      code: query.get('code'),
      denied: query.has('error')
    });
  } catch (error) {
    result = error instanceof AdvertisingError ? error.code : 'provider_error';
    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'ads.account.connect.rejected',
      metadata: { provider: 'GOOGLE', reason: result }
    });
  }
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: `/app/reklamlar/hesaplar?baglanti=${encodeURIComponent(result)}` }
  });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}, { limit: 30 });
