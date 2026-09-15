import { NextResponse } from 'next/server';
import { apiRoute } from '@/lib/api';
import { completeInstagramConnection } from '@/lib/social/instagramConnection';
import { InstagramConnectionError } from '@/lib/social/instagramConnectionMessages';
import { audit } from '@/lib/security/audit';
export const GET = apiRoute(async (request, { session }) => {
  const query = new URL(request.url).searchParams;
  let result = 'connected';
  try {
    await completeInstagramConnection(session, { state: query.get('state') || '', code: query.get('code'), denied: query.has('error') });
  } catch (error) {
    result = error instanceof InstagramConnectionError ? error.code : 'provider_error';
    await audit({ workspaceId: session.user.workspaceId, userId: session.user.id, action: 'account.connect.rejected', metadata: { platform: 'INSTAGRAM', reason: result } });
  }
  // Static destination + static result code only. No state/code/provider error body in the redirect.
  const response = new NextResponse(null, { status: 303, headers: {
    Location: `/sosyal-hesaplar?baglanti=${encodeURIComponent(result)}`
  } });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}, { limit: 30 });
