import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * AI çalışma alanı bağlamı.
 * ---------------------------------------------------------------------------
 * Yapay zeka servisleri (captionGenerationService vb.) fonksiyon imzalarında
 * workspaceId taşımaz; bunun yerine her API isteği `apiRoute` içinde çalışma
 * alanı kimliğiyle bu bağlama sarılır. AsyncLocalStorage, `await` zinciri
 * boyunca değeri korur; böylece servisler hiçbir imza değişikliği gerektirmeden
 * doğru çalışma alanının AI yapılandırmasını (sağlayıcı + anahtar) çözer.
 */
const storage = new AsyncLocalStorage<string | null>();

export function runWithAiWorkspace<T>(workspaceId: string | null, fn: () => T): T {
  return storage.run(workspaceId, fn);
}

/** İstek bağlamındaki çalışma alanı (bağlam yoksa null). */
export function currentAiWorkspaceId(): string | null {
  return storage.getStore() ?? null;
}
