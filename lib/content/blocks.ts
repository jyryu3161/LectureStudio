import { createHash } from 'node:crypto';

import type { GenericNode } from 'myst-common';

import {
  EQUATION_NODE,
  INSTRUCTOR_NOTE_NODE,
  LECTURE_SUMMARY_NODE,
  STUDENT_DETAIL_NODE,
} from './directives';
import type { BlockType, BlockVisibility } from './types';

/**
 * Maps a (post-lift) top-level AST node to its PRD §5.5 block type.
 *
 *  - heading/paragraph/code/image/math are standard mdast node types
 *    produced directly by myst-parser (e.g. a fenced code block or a bare
 *    `$$ ... $$` needs no directive at all).
 *  - lectureSummary/studentDetail/instructorNote/equation are produced by
 *    our own custom directives (see directives.ts).
 *  - `container` covers myst-directives' built-in `figure` (kind==='figure')
 *    and captioned `code` (kind==='code') directives.
 *  - Anything unrecognized (including a directive myst couldn't resolve —
 *    left as `type: 'mystDirective'` with a parse warning, see parse.ts)
 *    falls back to 'paragraph': safe (publicly visible, renders as text)
 *    and non-crashing rather than silently dropping content.
 */
export function blockTypeOf(node: GenericNode): BlockType {
  switch (node.type) {
    case 'heading':
      return 'heading';
    case 'paragraph':
      return 'paragraph';
    case LECTURE_SUMMARY_NODE:
      return 'lecture-summary';
    case STUDENT_DETAIL_NODE:
      return 'student-detail';
    case INSTRUCTOR_NOTE_NODE:
      return 'instructor-note';
    case EQUATION_NODE:
    case 'math':
      return 'equation';
    case 'code':
      return 'code';
    case 'image':
      return 'figure';
    case 'container':
      if (node.kind === 'figure') return 'figure';
      if (node.kind === 'code') return 'code';
      return 'paragraph';
    default:
      return 'paragraph';
  }
}

/**
 * Security invariant (PRD §5.6 / §15.3): only `instructor-note` blocks are
 * instructor-only; every other block type is public. This is the single
 * source of truth other code should use to decide visibility — never
 * infer it from anything else.
 */
export function visibilityForBlockType(blockType: BlockType): BlockVisibility {
  return blockType === 'instructor-note' ? 'instructor' : 'public';
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Collapse CRLF and trim so incidental whitespace edits don't drift the hash. */
function normalizeForHash(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

/**
 * content_hash input: the block's own source text, sliced by line from the
 * *already stable-id-marked* source (see stable-ids.ts). Node positions
 * from myst-parser only carry line/column (no byte offset — verified
 * against node_modules/myst-parser/dist/fromMarkdown.js), and every block
 * here is a top-level node that starts at column 1, so whole-line slicing
 * is exact.
 */
export function hashBlockSource(sourceLines: string[], node: GenericNode): string {
  if (!node.position) {
    // Defensive fallback only — top-level nodes always have a position in
    // practice (see parse.ts's backfillDirectivePositions).
    return sha256(normalizeForHash(JSON.stringify(node)));
  }
  const { start, end } = node.position;
  const slice = sourceLines.slice(start.line - 1, end.line).join('\n');
  return sha256(normalizeForHash(slice));
}

/** Small, denormalized extras useful to an inspector/renderer without a re-parse. */
export function deriveBlockMetadata(node: GenericNode): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (typeof node.lang === 'string') metadata.lang = node.lang;
  if (typeof node.alt === 'string') metadata.alt = node.alt;
  if (typeof node.depth === 'number') metadata.depth = node.depth;
  return metadata;
}
