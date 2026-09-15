/**
 * PHASE 4 — AI Provider Soyutlaması (§107-§108)
 * ------------------------------------------------
 * Tek bir AI sağlayıcısına bağlı kalmaz. Her yetenek (text, image, vision, transcription,
 * embeddings) için uygun sağlayıcı seçilir. Deterministic (yerel) her zaman fallback'tir.
 */

import { activeProvider, type AiProvider } from './llmClient';

export type AiCapability =
  | 'textGeneration'
  | 'structuredGeneration'
  | 'visionAnalysis'
  | 'imageGeneration'
  | 'imageEditing'
  | 'transcription'
  | 'embeddings';

export interface AiProviderAdapter {
  id: AiProvider;
  label: string;
  capabilities: AiCapability[];
  health: 'ok' | 'degraded' | 'down';
  textGeneration?: (input: { system: string; user: string; schema?: unknown }) => Promise<{ text: string; degraded: boolean }>;
  imageGeneration?: (input: { prompt: string; aspectRatio?: string; style?: string }) => Promise<{ url: string }>;
  embeddings?: (input: string[]) => Promise<number[][]>;
}

const deterministicAdapter: AiProviderAdapter = {
  id: 'deterministic',
  label: 'Yerel Motor (Demo)',
  capabilities: ['textGeneration', 'structuredGeneration', 'visionAnalysis', 'transcription', 'embeddings'],
  health: 'ok',
  textGeneration: async ({ system, user }) => ({ text: `[DEMO] ${user.slice(0, 120)}`, degraded: true }),
  embeddings: async (texts) => texts.map(() => Array.from({ length: 384 }, () => Math.random() - 0.5)),
};

const openAiAdapter: AiProviderAdapter = {
  id: 'openai',
  label: 'OpenAI',
  capabilities: ['textGeneration', 'structuredGeneration', 'visionAnalysis', 'imageGeneration', 'imageEditing', 'transcription', 'embeddings'],
  health: 'ok',
};

const anthropicAdapter: AiProviderAdapter = {
  id: 'anthropic',
  label: 'Anthropic',
  capabilities: ['textGeneration', 'structuredGeneration', 'visionAnalysis'],
  health: 'ok',
};

const REGISTRY: Record<AiProvider, AiProviderAdapter> = {
  deterministic: deterministicAdapter,
  openai: openAiAdapter,
  anthropic: anthropicAdapter,
};

export function getProvider(id?: AiProvider): AiProviderAdapter {
  return REGISTRY[id ?? activeProvider()] ?? deterministicAdapter;
}

export function routeByCapability(capability: AiCapability): AiProviderAdapter {
  const preferred = getProvider();
  if (preferred.capabilities.includes(capability)) return preferred;
  // fallback to any provider that supports it
  for (const p of Object.values(REGISTRY)) if (p.capabilities.includes(capability)) return p;
  return deterministicAdapter;
}

export function listProviders(): AiProviderAdapter[] {
  return Object.values(REGISTRY);
}

export function providerHealthMessage(): string {
  const p = getProvider();
  if (p.id === 'deterministic') return 'AI demo modunda çalışıyor. Harici sağlayıcı yapılandırılmadı.';
  return `${p.label} etkin.`;
}
