import prisma from '../prisma';
import { env } from '../env';
import { fromCipherText } from '../crypto';
import { logger } from '../observability';

/**
 * Sağlayıcı kimlik bilgisi çözümleme (BYOK).
 * ---------------------------------------------------------------------------
 * Öncelik:
 *   1. Çalışma alanının Entegrasyonlar ekranından kaydettiği kimlik (şifreli)
 *   2. Sunucu ortam değişkenleri (INSTAGRAM_APP_ID vb.)
 * İkisi de yoksa null döner → sağlayıcı simülasyon modunda kalır.
 */

export interface ResolvedCredentials {
  id: string;
  secret: string;
  /** Kimlik çalışma alanı tarafından panodan girildiyse true. */
  fromWorkspace: boolean;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; creds: ResolvedCredentials | null }>();

function envCredentials(platform: string): ResolvedCredentials | null {
  const c = env.providers[platform];
  if (c && c.id && c.secret) return { id: c.id, secret: c.secret, fromWorkspace: false };
  return null;
}

function cacheKey(workspaceId: string, platform: string): string {
  return `${workspaceId}:${platform}`;
}

export async function resolveProviderCredentials(
  workspaceId: string | null | undefined,
  platform: string
): Promise<ResolvedCredentials | null> {
  if (workspaceId) {
    const key = cacheKey(workspaceId, platform);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.creds ?? envCredentials(platform);
    }

    const row = await prisma.providerCredential.findUnique({
      where: { workspaceId_platform: { workspaceId, platform } }
    });
    let creds: ResolvedCredentials | null = null;
    if (row) {
      try {
        creds = { id: row.clientId, secret: fromCipherText(row.clientSecretEnc), fromWorkspace: true };
      } catch {
        logger.warn({ event: 'provider.credential_decrypt_failed', workspaceId, platform });
        creds = null;
      }
    }
    cache.set(key, { at: Date.now(), creds });
    return creds ?? envCredentials(platform);
  }
  return envCredentials(platform);
}

/** Eşzamanlı okuma: yalnızca önbellek/ortam değişkeni (istek bağlamı içinde). */
export function resolveProviderCredentialsNow(
  workspaceId: string | null | undefined,
  platform: string
): ResolvedCredentials | null {
  if (workspaceId) {
    const hit = cache.get(cacheKey(workspaceId, platform));
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.creds ?? envCredentials(platform);
    }
  }
  return envCredentials(platform);
}

export function invalidateProviderCredentials(workspaceId: string, platform?: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${workspaceId}:`) && (!platform || key === cacheKey(workspaceId, platform))) {
      cache.delete(key);
    }
  }
}

/** Önbelleği doldurur (worker/route başlangıcında sıcak okuma için). */
export async function warmProviderCredentials(workspaceId: string, platform: string): Promise<void> {
  await resolveProviderCredentials(workspaceId, platform);
}
