import { apiRoute, ok, badRequest, forbidden } from '@/lib/api';
import prisma from '@/lib/prisma';
import { assertRole } from '@/lib/auth/session';
import { audit } from '@/lib/security/audit';
import { toCipherText } from '@/lib/crypto';
import {
  getWorkspaceAiConfig,
  invalidateWorkspaceAiConfig,
  isAiProviderChoice,
  maskApiKey,
  AI_PROVIDER_DEFAULTS
} from '@/lib/ai/workspaceConfig';
import { buildAdapterFromConfig } from '@/lib/ai/provider';

/**
 * Yapay Zeka Sağlayıcısı ayarları (§36, §71).
 * ---------------------------------------------------------------------------
 * Çalışma alanı kendi AI sağlayıcısını ve API anahtarını seçer (BYOK).
 * Anahtar şifrelenerek saklanır ve GET yanıtında ASLA düz metin dönmez;
 * yalnızca maskeli görünüm verilir.
 */
export const GET = apiRoute(async (_request, { session }) => {
  const cfg = await getWorkspaceAiConfig(session.user.workspaceId);
  const adapter = buildAdapterFromConfig({ provider: cfg.provider, key: cfg.key, model: cfg.model, baseUrl: cfg.baseUrl });
  return ok({
    provider: cfg.provider,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    hasKey: Boolean(cfg.key),
    keyMasked: maskApiKey(cfg.key),
    keyFromWorkspace: cfg.keyFromWorkspace,
    activeEngine: adapter.name,
    defaults: AI_PROVIDER_DEFAULTS
  });
});

export const PATCH = apiRoute(
  async (request, { session }) => {
    assertRole(session, 'ADMIN');
    const body = await request.json().catch(() => ({}));

    const data: {
      aiProvider?: string;
      aiModel?: string | null;
      aiBaseUrl?: string | null;
      aiApiKeyEnc?: string | null;
    } = {};

    if (body.aiProvider !== undefined) {
      if (!isAiProviderChoice(body.aiProvider)) return badRequest('Geçersiz sağlayıcı seçimi.');
      data.aiProvider = body.aiProvider;
    }
    if (body.aiModel !== undefined) {
      const model = typeof body.aiModel === 'string' ? body.aiModel.trim() : '';
      data.aiModel = model || null;
    }
    if (body.aiBaseUrl !== undefined) {
      const url = typeof body.aiBaseUrl === 'string' ? body.aiBaseUrl.trim() : '';
      if (url && !/^https?:\/\//i.test(url)) return badRequest('Taban URL http(s) ile başlamalıdır.');
      data.aiBaseUrl = url || null;
    }
    // Anahtar: dolu geldiyse şifrele ve sakla; `null` geldiyse sil; gelmediyse dokunma.
    let keyChanged: 'set' | 'cleared' | 'unchanged' = 'unchanged';
    if (body.aiApiKey === null) {
      data.aiApiKeyEnc = null;
      keyChanged = 'cleared';
    } else if (typeof body.aiApiKey === 'string' && body.aiApiKey.trim()) {
      const key = body.aiApiKey.trim();
      if (key.length < 8) return badRequest('API anahtarı çok kısa görünüyor; kontrol edip tekrar deneyin.');
      data.aiApiKeyEnc = toCipherText(key);
      keyChanged = 'set';
    }

    const settings = await prisma.appSettings.upsert({
      where: { workspaceId: session.user.workspaceId },
      create: { workspaceId: session.user.workspaceId, ...data },
      update: data
    });
    invalidateWorkspaceAiConfig(session.user.workspaceId);

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'settings.ai',
      metadata: { changed: Object.keys(data), keyChanged },
      request
    });

    const cfg = await getWorkspaceAiConfig(session.user.workspaceId);
    return ok({
      settings: { ...settings, aiApiKeyEnc: undefined },
      provider: cfg.provider,
      model: cfg.model,
      hasKey: Boolean(cfg.key),
      keyMasked: maskApiKey(cfg.key)
    });
  },
  { limit: 30 }
);
