/**
 * Provider registry — maps ProviderId to its AiProvider implementation.
 *
 * Pure/dependency-light (no next/headers, no DB) so it is importable from
 * anywhere. The concrete SDK clients are only constructed lazily inside each
 * provider's generate(), so importing the registry never opens a network
 * connection or needs a key.
 */
import { anthropicProvider } from './providers/anthropic';
import { geminiProvider } from './providers/gemini';
import { mockProvider } from './providers/mock';
import type { AiProvider, ProviderId } from './types';

const REGISTRY: Record<ProviderId, AiProvider> = {
  mock: mockProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
};

/** Returns the provider for `id`. Throws on an unknown id (never silent). */
export function getProvider(id: ProviderId): AiProvider {
  const provider = REGISTRY[id];
  if (!provider) {
    throw new Error(`Unknown AI provider: ${String(id)}`);
  }
  return provider;
}

/** All providers, for building settings UIs (labels + model lists). */
export function listProviders(): AiProvider[] {
  return [mockProvider, anthropicProvider, geminiProvider];
}
