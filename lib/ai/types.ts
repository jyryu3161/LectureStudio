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
 * PRD §9.3 / MVP4 §9.4 — the artifact kinds the assistant can produce. The
 * output of every generation is ALWAYS MyST markdown text ready to insert into
 * a chapter:
 *  - figure-code: a python matplotlib code block + a short figure usage note.
 *  - quiz: a quiz-style MyST section.
 *  - animation-code: a matplotlib.animation (FuncAnimation) code block + usage note.
 *  - difficulty-adjust: a rewrite of the chapter/selection for a target level
 *    ('더 쉽게' | '더 어렵게', carried in the free-text instruction), as MyST.
 *  - revision-from-annotations: content revision suggestions grounded in the
 *    published lecture-session annotation stats for the chapter.
 */
export type ArtifactKind =
  | 'outline'
  | 'student-explanation'
  | 'instructor-summary'
  | 'figure-code'
  | 'code-explanation'
  | 'quiz'
  | 'animation-code'
  | 'difficulty-adjust'
  | 'revision-from-annotations';

export const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  'outline',
  'student-explanation',
  'instructor-summary',
  'figure-code',
  'code-explanation',
  'quiz',
  'animation-code',
  'difficulty-adjust',
  'revision-from-annotations',
];

export function isArtifactKind(value: unknown): value is ArtifactKind {
  return typeof value === 'string' && (ARTIFACT_KINDS as readonly string[]).includes(value);
}

/** The three drawable annotation kinds (mirrors annotations.annotation_type). */
export type AnnotationType = 'pen' | 'highlighter' | 'text';

/**
 * Per-block annotation statistics for one heavily-annotated block, assembled
 * server-side from the chapter's PUBLISHED lecture-session annotations
 * (MVP4 'revision-from-annotations'). `sourceText` is the block's MyST source
 * so the model can revise the actual content, not just a summary.
 */
export interface AnnotationBlockStat {
  blockId: string;
  count: number;
  /** Count by annotation_type (only non-zero types present). */
  byType: Partial<Record<AnnotationType, number>>;
  sourceText: string;
}

/**
 * The assembled annotation context for a 'revision-from-annotations' request:
 * aggregate stats plus the top-N most-annotated blocks with their source. Also
 * persisted (rendered) into ai_artifacts.source_context for provenance.
 */
export interface AnnotationContext {
  sessionCount: number;
  totalAnnotations: number;
  /** Most-annotated blocks first, capped to a small N (see artifacts.ts). */
  blocks: AnnotationBlockStat[];
}

/**
 * Everything a provider needs to ground a generation in the current chapter.
 * `blockId` is set when the request is anchored to a specific block (e.g.
 * "explain this code block"); otherwise the whole chapter is the context.
 * `annotations` is populated only for 'revision-from-annotations'.
 */
export interface GenerateContext {
  courseTitle: string;
  chapterTitle: string;
  chapterSource: string;
  blockId?: string;
  annotations?: AnnotationContext;
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
