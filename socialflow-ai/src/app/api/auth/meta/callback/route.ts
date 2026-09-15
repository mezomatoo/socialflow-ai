import { handleUnifiedOAuthCallback } from '@/lib/social/unifiedCallbackHandler';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleUnifiedOAuthCallback(request, 'META');
}
