/**
 * AI Authoring Assistant — shared contract types (PRD §9).
 *
 * This is the single source of truth for the provider interface every AI
 * provider (mock/anthropic/gemini) implements and for the six artifact kinds
 * the assistant can generate. Kept dependency-free so it is safe to import
 * from both server code (server actions, RSC) and tests.
 */

/** Provider identifiers, mirroring the ai_settings.active_provider check. */
export type ProviderId = 'mock' | 'anthropic' | 'gemini';

export const PROVIDER_IDS: readonly ProviderId[] = ['mock', 'anthropic', 'gemini'];

/**
 * PRD §9.3 — the six artifact kinds the assistant can produce. The output of
 * every generation is ALWAYS MyST markdown text ready to insert into a
 * chapter:
 *  - figure-code: a python matplotlib code block + a short figure usage note.
 *  - quiz: a quiz-style MyST section.
 */
export type ArtifactKind =
  | 'outline'
  | 'student-explanation'
  | 'instructor-summary'
  | 'figure-code'
  | 'code-explanation'
  | 'quiz';

export const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  'outline',
  'student-explanation',
  'instructor-summary',
  'figure-code',
  'code-explanation',
  'quiz',
];

export function isArtifactKind(value: unknown): value is ArtifactKind {
  return typeof value === 'string' && (ARTIFACT_KINDS as readonly string[]).includes(value);
}

/**
 * Everything a provider needs to ground a generation in the current chapter.
 * `blockId` is set when the request is anchored to a specific block (e.g.
 * "explain this code block"); otherwise the whole chapter is the context.
 */
export interface GenerateContext {
  courseTitle: string;
  chapterTitle: string;
  chapterSource: string;
  blockId?: string;
}

export interface GenerateRequest {
  kind: ArtifactKind;
  instruction: string;
  context: GenerateContext;
}

/**
 * Per-call provider configuration resolved server-side from ai_settings +
 * ai_provider_keys. `apiKey` is null for the mock provider (which never makes
 * a network call and needs no key).
 */
export interface ProviderConfig {
  apiKey: string | null;
  model: string;
}

/**
 * The provider interface (AI CONTRACT). `generate` always resolves to MyST
 * markdown text; providers map their own SDK/transport errors to clean,
 * user-facing `Error` messages (never leaking keys or stack noise).
 */
export interface AiProvider {
  id: ProviderId;
  label: string;
  models: string[];
  defaultModel: string;
  generate(req: GenerateRequest, cfg: ProviderConfig): Promise<string>;
}

/** Result of a lightweight provider connectivity check (testProvider). */
export interface ProviderTestResult {
  ok: boolean;
  message: string;
}
