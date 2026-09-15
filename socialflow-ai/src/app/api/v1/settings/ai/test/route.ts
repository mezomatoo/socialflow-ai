import { apiRoute, ok, badRequest } from '@/lib/api';
import { assertRole } from '@/lib/auth/session';
import { getWorkspaceAiConfig, isAiProviderChoice } from '@/lib/ai/workspaceConfig';
import { buildAdapterFromConfig } from '@/lib/ai/provider';

/**
 * AI bağlantı testi.
 * Panodaki (veya test için geçici olarak girilen) yapılandırmayla küçük bir
 * üretim çağrısı yapılır; sonuç gerçek zamanlı döner. Anahtar asla yanıtta yer almaz.
 */
export const POST = apiRoute(
  async (request, { session }) => {
    assertRole(session, 'ADMIN');
    const body = await request.json().catch(() => ({}));
    const saved = await getWorkspaceAiConfig(session.user.workspaceId);

    const provider = body.aiProvider !== undefined ? body.aiProvider : saved.provider;
    if (!isAiProviderChoice(provider)) return badRequest('Geçersiz sağlayıcı seçimi.');

    const model =
      (typeof body.aiModel === 'string' && body.aiModel.trim()) || (provider === saved.provider ? saved.model : null) || null;
    const baseUrl =
      (typeof body.aiBaseUrl === 'string' && body.aiBaseUrl.trim()) ||
      (provider === saved.provider ? saved.baseUrl : null) ||
      null;
    const key =
      typeof body.aiApiKey === 'string' && body.aiApiKey.trim()
        ? body.aiApiKey.trim()
        : provider === saved.provider
          ? saved.key
          : null;

    if (provider === 'deterministic') {
      return ok({
        ok: true,
        provider: 'deterministic',
        model: null,
        ms: 0,
        message: 'Yerel motor anahtar gerektirmez; her zaman hazırdır.'
      });
    }
    if (!key) {
      return ok({
        ok: false,
        provider,
        model,
        ms: 0,
        message: 'Bu sağlayıcı için önce bir API anahtarı girmeniz gerekiyor.'
      });
    }

    const adapter = buildAdapterFromConfig({ provider, key, model, baseUrl });
    const result = await adapter.textGeneration({
      system: 'Sen bir bağlantı testisin. Yalnızca tek bir Türkçe kelimeyle yanıt ver.',
      user: 'Bağlantı testi.',
      task: 'AI_TEST',
      temperature: 0,
      maxTokens: 24,
      timeoutMs: 15_000
    });

    if (result.failed || result.degraded) {
      return ok({
        ok: false,
        provider,
        model: result.model ?? model,
        ms: result.durationMs,
        message: result.failureMessage ?? 'AI sağlayıcısına ulaşılamadı. Anahtarı ve modeli kontrol edin.'
      });
    }

    return ok({
      ok: true,
      provider: result.provider,
      model: result.model,
      ms: result.durationMs,
      message: 'Bağlantı başarılı.'
    });
  },
  { limit: 20 }
);
