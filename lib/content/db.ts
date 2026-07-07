import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@/lib/supabase/types';

import type { Block } from './types';

export interface UpsertBlockIndexResult {
  upserted: number;
  deleted: number;
}

/**
 * Keys in content_blocks.metadata that are managed out-of-band (set by the
 * authoring "실행 가능" toggle via updateBlockMeta, NOT derived from source by
 * deriveBlockMetadata). A chapter re-save rewrites metadata wholesale from the
 * freshly-parsed blocks, so these must be carried over from the existing row
 * or the flag would be silently wiped on every save.
 */
const PRESERVED_METADATA_KEYS = ['executable'] as const;

/**
 * Write-through for the parsed block index (PRD §5.3/§5.6 data model):
 * upserts every block for one chapter into `content_blocks`, then deletes
 * any row for that chapter whose id is no longer among `blocks` (a block
 * that was removed from the source).
 *
 * Accepts an already-constructed Supabase client rather than creating one
 * itself — callers differ in how they need to authenticate:
 *  - Server Components/route handlers/server actions pass
 *    `await createClient()` from '@/lib/supabase/server' (request-scoped,
 *    RLS applies as the signed-in author/admin).
 *  - scripts/ingest-seed.ts runs outside any Next.js request (no
 *    `next/headers` cookies to read), so it builds its own client directly
 *    via `@supabase/supabase-js`'s `createClient(url, serviceRoleKey)` to
 *    bypass RLS, the same trusted server-side pattern used for course
 *    bootstrap (see supabase/migrations/0001_init.sql).
 *
 * Ordering matters for data-loss safety: new/updated rows are upserted
 * *before* stale ones are looked up and deleted, so a failure never leaves
 * the chapter with fewer blocks than either the old or new source implies.
 * Any failure throws with the partial-progress state described in the
 * message rather than swallowing it.
 */
export async function upsertBlockIndex(
  supabase: SupabaseClient<Database>,
  chapterId: string,
  courseId: string | null,
  versionId: string | null,
  blocks: Block[],
): Promise<UpsertBlockIndexResult> {
  // Read the existing rows BEFORE upserting: needed both to preserve
  // author-managed metadata keys (see PRESERVED_METADATA_KEYS) and to find
  // stale blocks. Reading before the upsert is equivalent for stale detection
  // (an upsert only inserts/updates ids we're keeping, never removes any), and
  // saves a second round-trip.
  const { data: existingRows, error: selectError } = await supabase
    .from('content_blocks')
    .select('id, metadata')
    .eq('chapter_id', chapterId);
  if (selectError) {
    throw new Error(
      `upsertBlockIndex: failed to read existing blocks for chapter ${chapterId} ` +
        `(needed to preserve metadata and find stale blocks): ${selectError.message}`,
    );
  }
  const priorMetadataById = new Map<string, Record<string, unknown>>(
    (existingRows ?? []).map((row) => [row.id, (row.metadata ?? {}) as Record<string, unknown>]),
  );

  const rows = blocks.map((block) => {
    // Freshly-parsed metadata is the base; carry over any author-managed keys
    // from the block's existing row so a re-save never clobbers them.
    const metadata: Record<string, unknown> = { ...block.metadata };
    const prior = priorMetadataById.get(block.id);
    if (prior) {
      for (const key of PRESERVED_METADATA_KEYS) {
        if (key in prior) metadata[key] = prior[key];
      }
    }
    return {
      id: block.id,
      course_id: courseId,
      chapter_id: chapterId,
      version_id: versionId,
      block_type: block.blockType,
      order_index: block.order,
      content_hash: block.contentHash,
      visibility: block.visibility,
      // Plain, JSON-serializable objects by construction (see blocks.ts) —
      // safe to hand to a jsonb column.
      source_range: (block.sourceRange as unknown as Json) ?? null,
      metadata: metadata as unknown as Json,
    };
  });

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('content_blocks')
      .upsert(rows, { onConflict: 'id' });
    if (upsertError) {
      throw new Error(
        `upsertBlockIndex: failed to upsert ${rows.length} block(s) for chapter ${chapterId}: ${upsertError.message}`,
      );
    }
  }

  const keepIds = new Set(blocks.map((block) => block.id));
  const staleIds = (existingRows ?? []).map((row) => row.id).filter((id) => !keepIds.has(id));

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('content_blocks')
      .delete()
      .in('id', staleIds);
    if (deleteError) {
      throw new Error(
        `upsertBlockIndex: upserted ${rows.length} block(s) OK, but failed to delete ${staleIds.length} stale ` +
          `block(s) for chapter ${chapterId}: ${deleteError.message}`,
      );
    }
  }

  return { upserted: rows.length, deleted: staleIds.length };
}
