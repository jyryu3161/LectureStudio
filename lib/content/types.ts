import type { GenericNode, GenericParent } from 'myst-common';

/**
 * PRD §5.5 block types. `video`, `animation`, `interactive-demo`, and `quiz`
 * are stub-only for MVP0 (no authoring syntax registered yet, see
 * directives.ts) but are already part of the type so downstream code
 * (renderer, block inspector) can switch over the full set now.
 */
export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'lecture-summary'
  | 'student-detail'
  | 'instructor-note'
  | 'equation'
  | 'figure'
  | 'code'
  | 'code-output'
  | 'video'
  | 'animation'
  | 'interactive-demo'
  | 'quiz';

/**
 * PRD §5.6 / §15.3: `instructor` blocks must never reach a student/guest —
 * enforced again at the DB layer (RLS on content_blocks), this is just the
 * classification the Content Engine assigns.
 */
export type BlockVisibility = 'public' | 'instructor';

/** Re-use myst's own position shape instead of redeclaring it. */
export type SourceRange = NonNullable<GenericNode['position']>;

/**
 * One top-level MyST/mdast node, with its stable identity and derived
 * metadata attached. `node` is the (already directive-lifted) AST node —
 * hand it directly to a MyST renderer (e.g. myst-to-react).
 */
export interface Block {
  id: string;
  blockType: BlockType;
  order: number;
  contentHash: string;
  visibility: BlockVisibility;
  sourceRange: SourceRange | null;
  /** Small, JSON-serializable extras (e.g. code language, heading depth). */
  metadata: Record<string, unknown>;
  node: GenericNode;
}

/** Serializable summary of a vfile message — safe to assert on in tests. */
export interface ParseWarning {
  message: string;
  line: number | null;
  column: number | null;
  /** true = error, false = warning, null/undefined = info. */
  fatal: boolean | null;
  ruleId: string | null;
  source: string | null;
}

export interface ParseResult {
  tree: GenericParent;
  warnings: ParseWarning[];
}

export interface EnsureStableIdsResult {
  source: string;
  blocks: Block[];
}
