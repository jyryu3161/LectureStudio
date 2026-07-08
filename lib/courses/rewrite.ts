import type { Json } from '@/lib/supabase/types';

/**
 * Pure, dependency-free source-rewrite helpers for multi-term course
 * duplication (PRD §10 course reuse). No DB / server imports so they are
 * trivially unit-testable (see tests/courses/duplicate.test.ts).
 *
 * WHY THESE EXIST — the block-id decision:
 * `content_blocks.id` is the SOLE primary key (supabase/migrations/0001), so a
 * stable block id is globally unique and CANNOT be reused under a second
 * chapter row. Duplicating a course into a new term therefore MUST mint NEW
 * block ids. But annotations anchor to a block by its id string (a plain text
 * column, not an FK — see 0002), and the chapter's canonical MyST `source`
 * embeds each block id in a `<!-- blk:… -->` marker comment (lib/content/
 * stable-ids.ts). To keep everything consistent AND preserve annotation
 * anchoring, the duplicator builds an old→new block-id map once, then:
 *   1. rewrites the marker comments in the copied `source` (so a future
 *      re-parse/ensureStableIds sees the new ids and stays consistent), and
 *   2. remaps every copied annotation's `block_id` through the same map.
 * Interactive-demo blocks additionally carry a `marimo_apps` id both in the
 * source directive (`:::{interactive-demo} <appId>`) and in the block's
 * `metadata.appId`; those are remapped through the demo old→new map so the
 * copied demos (rebuilt fresh) resolve correctly.
 */

/**
 * Matches a stable-id marker comment anywhere in the source. Mirrors the
 * canonical form written by lib/content/stable-ids.ts (`<!-- blk:<id> -->`),
 * tolerant of surrounding whitespace. The id alphabet is nanoid's
 * URL-safe set (`A-Za-z0-9_-`) with the `blk_` prefix.
 */
const MARKER_RE = /<!--\s*blk:(blk_[A-Za-z0-9_-]+)\s*-->/g;

/**
 * Matches an `interactive-demo` directive opener and captures its app-id
 * argument (a UUID). Only the braced form is remapped — that is the only form
 * the directive parser accepts (lib/content/directives.ts registers it as a
 * real directive; `normalize.ts` never expands a bare `interactive-demo`).
 */
const DEMO_DIRECTIVE_RE = /(:{3,}\{interactive-demo\}[ \t]+)([0-9a-fA-F-]{36})/g;

/**
 * Rewrites every `<!-- blk:OLD -->` marker to its mapped new id, re-emitting
 * the canonical `<!-- blk:NEW -->` spacing. A marker whose id is not in the
 * map is left untouched (defensive: e.g. a marker for a block that had no
 * `content_blocks` row — it simply carries its old id forward rather than
 * being dropped).
 */
export function remapSourceMarkers(source: string, blockIdMap: Map<string, string>): string {
  return source.replace(MARKER_RE, (whole, id: string) => {
    const next = blockIdMap.get(id);
    return next ? `<!-- blk:${next} -->` : whole;
  });
}

/**
 * Rewrites the `<appId>` argument of every `:::{interactive-demo} <appId>`
 * directive through the demo old→new id map. An id not in the map is left
 * untouched.
 */
export function remapDemoDirectives(source: string, demoIdMap: Map<string, string>): string {
  return source.replace(DEMO_DIRECTIVE_RE, (whole, prefix: string, id: string) => {
    const next = demoIdMap.get(id);
    return next ? `${prefix}${next}` : whole;
  });
}

/**
 * Full source rewrite for a duplicated chapter: remap stable-id markers, then
 * remap interactive-demo directive ids. Order is independent (the two regexes
 * never overlap), but demo-first-or-last is fixed here for determinism.
 */
export function rewriteChapterSource(
  source: string,
  blockIdMap: Map<string, string>,
  demoIdMap: Map<string, string>,
): string {
  return remapDemoDirectives(remapSourceMarkers(source, blockIdMap), demoIdMap);
}

/**
 * Remaps a content block's `metadata.appId` (interactive-demo blocks only)
 * through the demo old→new id map, returning a new metadata object. Any other
 * metadata shape is returned unchanged. Keeps `content_blocks.metadata.appId`
 * in sync with the rewritten source directive so the renderer resolves the
 * copied (rebuilt) demo, not the original term's.
 */
export function remapBlockMetadataDemoId(
  metadata: Json | null,
  demoIdMap: Map<string, string>,
): Json | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata;
  const record = metadata as { [key: string]: Json | undefined };
  const appId = record.appId;
  if (typeof appId !== 'string') return metadata;
  const next = demoIdMap.get(appId);
  if (!next) return metadata;
  return { ...record, appId: next } as Json;
}
