/**
 * AI assistant public API — CLIENT-SAFE surface only.
 *
 * Exports the contract types and the pure provider registry (labels/models),
 * which contain no server-only imports, so Client Components may import from
 * here freely. Server-only modules (settings.ts, artifacts.ts) and the
 * 'use server' actions (actions.ts) must be imported directly from their files,
 * never re-exported here, so they never leak into a client bundle.
 */
export { buildPrompt, type BuiltPrompt } from './prompts';
export { getProvider, listProviders } from './registry';
export type {
  AiProvider,
  ArtifactKind,
  GenerateContext,
  GenerateRequest,
  ProviderConfig,
  ProviderId,
  ProviderTestResult,
} from './types';
export { ARTIFACT_KINDS, isArtifactKind, PROVIDER_IDS } from './types';
