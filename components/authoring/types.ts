import type { ReactNode } from 'react';

import type { BlockType, BlockVisibility, ParseWarning } from '@/lib/content';

/**
 * Shared types for the Authoring Studio (PRD §6.1). Colocated here (rather
 * than under `app/authoring/_lib`) so both the server-action code in
 * `app/authoring/**` and the presentational components in this directory
 * import from one place, keeping the dependency direction conventional
 * (`app/*` depends on `components/*`, not the reverse).
 */

/** Upper bound on a chapter's MyST source, enforced by both the preview action and the save action. */
export const MAX_CHAPTER_SOURCE_LENGTH = 200_000;

/** Read-only summary of one parsed block, for the Block Inspector panel (PRD §6.1). */
export interface BlockSummary {
  id: string;
  blockType: BlockType;
  visibility: BlockVisibility;
  order: number;
  /** Short plain-text snippet of the block's content, for the Inspector list. */
  preview: string;
}

/**
 * Parse + author-role render of one chapter's current source (see
 * app/authoring/_lib/preview.ts). `elements` is the actual rendered React
 * tree -- Reading Mode's own block components, server-executed -- passed
 * through as-is (never stringified via `react-dom/server`: Next's App
 * Router build forbids importing it anywhere in the route/page module
 * graph, and the idiomatic fix is exactly this: return/render the content
 * directly instead of manually serializing it to an HTML string).
 */
export interface PreviewResult {
  elements: ReactNode;
  blocks: BlockSummary[];
  warnings: ParseWarning[];
}

/** Input to the `renderChapterPreview` Server Action (app/authoring/preview-action.ts). */
export interface PreviewActionInput {
  courseId: string;
  source: string;
}

export type PreviewActionResult = ({ ok: true } & PreviewResult) | { ok: false; error: string };

export interface AuthoringCourseMeta {
  id: string;
  title: string;
}

export interface AuthoringChapterMeta {
  id: string;
  title: string;
  slug: string;
  courseId: string;
  versionId: string | null;
}

/** Input to the `saveChapterSource` Server Action (app/authoring/[courseSlug]/[chapterSlug]/actions.ts). */
export interface SaveChapterInput {
  courseId: string;
  chapterId: string;
  versionId: string | null;
  source: string;
}

export type SaveChapterResult =
  | {
      ok: true;
      /** Canonical source as written to the DB -- may differ from the input (stable-id markers injected). */
      source: string;
      blocks: BlockSummary[];
      warnings: ParseWarning[];
      savedAt: string;
    }
  | {
      ok: false;
      error: string;
    };

/** Input to the `reloadChapterSource` Server Action (app/authoring/[courseSlug]/[chapterSlug]/actions.ts). */
export interface ReloadChapterSourceInput {
  courseId: string;
  chapterId: string;
}

/**
 * Result of re-reading the canonical chapter source from the DB. Used after an
 * AI draft is approved (which appends its MyST to `chapters.source` server-side,
 * injecting stable-id markers): the editor buffer must be replaced with this
 * canonical text so a subsequent save never re-mints ids for the new blocks.
 */
export type ReloadChapterSourceResult =
  | { ok: true; source: string }
  | { ok: false; error: string };
