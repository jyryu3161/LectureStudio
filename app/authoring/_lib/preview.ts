/**
 * SERVER-ONLY. This transitively imports myst-parser (via `@/lib/content`)
 * -- never import this module from a 'use client' component (see
 * lib/content/parse.ts's own module-boundary note).
 *
 * Shared MyST parse + author-role render pipeline for the Authoring
 * Studio's live preview: both the initial server-rendered pass
 * (app/authoring/[courseSlug]/[chapterSlug]/page.tsx) and every subsequent
 * debounced call from the `renderChapterPreview` Server Action
 * (app/authoring/preview-action.ts) call this, so the two never drift out
 * of sync with each other.
 *
 * Deliberately returns the rendered React element tree as-is instead of a
 * pre-serialized HTML string: Next's App Router build statically forbids
 * importing `react-dom/server` anywhere in the route/page module graph
 * ("render or return the content directly as a Server Component instead
 * for perf and security"), so the preview is handed to the client exactly
 * that way -- as real React elements over the RSC boundary, rendered
 * directly (no `dangerouslySetInnerHTML`) by PreviewPane.
 */
import type { GenericNode } from 'myst-common';

import type { BlockSummary, PreviewResult } from '@/components/authoring/types';
import { ensureStableIds, parseWithWarnings, type Block } from '@/lib/content';
import { mystNodesToPlainText, renderBlocks } from '@/lib/render';

const SNIPPET_LENGTH = 100;

function snippetFor(node: GenericNode): string {
  const text = mystNodesToPlainText([node]);
  if (!text) return '';
  return text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH)}…` : text;
}

/** Maps parsed Blocks to the Block Inspector's read-only summary shape (PRD §6.1). */
export function summarizeBlocks(blocks: Block[]): BlockSummary[] {
  return blocks.map((block) => ({
    id: block.id,
    blockType: block.blockType,
    visibility: block.visibility,
    order: block.order,
    preview: snippetFor(block.node),
  }));
}

/**
 * Parses `source` and renders it exactly like Reading Mode would, but
 * always as an *author* (`role: 'author'`) regardless of who is actually
 * previewing -- the whole point of the Authoring Studio preview is to let
 * an author see instructor-note content while editing it (see
 * components/blocks/instructor-note.tsx). Reading Mode itself
 * (lib/render/render-blocks.tsx) is what enforces the real student/guest
 * visibility filter, and only ever runs against already-saved content --
 * this function never persists anything, it only reflects back what the
 * *current, possibly-unsaved* editor buffer would look like.
 *
 * Never throws by construction (ensureStableIds/parseWithWarnings/
 * renderBlocks are all documented to degrade gracefully on malformed
 * input) -- but callers should still treat this as fallible I/O-adjacent
 * work and wrap it in try/catch, since it's the boundary where a future
 * change to any of those could start throwing.
 */
export async function buildPreview(source: string): Promise<PreviewResult> {
  const { blocks } = ensureStableIds(source);
  const { warnings } = parseWithWarnings(source);
  const elements = await renderBlocks(blocks, { role: 'author' });

  return { elements, warnings, blocks: summarizeBlocks(blocks) };
}
