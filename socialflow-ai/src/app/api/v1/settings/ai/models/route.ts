import { apiRoute, ok, badRequest } from '@/lib/api';
import { assertRole } from '@/lib/auth/session';
import { getWorkspaceAiConfig, isAiProviderChoice } from '@/lib/ai/workspaceConfig';
import { fetchModelCatalog } from '@/lib/ai/modelCatalog';

/**
 * Sağlayıcının GÜNCEL model listesi.
 * Anahtar henüz kaydedilmemişse test amaçlı `apiKey` sorgu parametresi kabul
 * edilir; parametre yoksa çalışma alanının kayıtlı anahtarı kullanılır.
 */
export const GET = apiRoute(async (request, { session }) => {
  assertRole(session, 'ADMIN');
  const url = new URL(request.url);
  const providerParam = url.searchParams.get('provider') ?? '';
  if (!isAiProviderChoice(providerParam)) return badRequest('Geçersiz sağlayıcı.');
  if (providerParam === 'deterministic') {
    return ok({ source: 'builtin', models: [], note: 'Yerel motor model seçimi gerektirmez.' });
  }

  const saved = await getWorkspaceAiConfig(session.user.workspaceId);
  const paramKey = url.searchParams.get('apiKey');
  const paramBaseUrl = url.searchParams.get('baseUrl');

  const key = paramKey?.trim() || (providerParam === saved.provider ? saved.key : null);
  const baseUrl =
    paramBaseUrl?.trim() || (providerParam === saved.provider ? saved.baseUrl : null) || null;

  const catalog = await fetchModelCatalog(providerParam, { key, baseUrl });
  return ok(catalog);
});
