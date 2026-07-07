import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@/lib/supabase/types';

import type { Block } from './types';

export interface UpsertBlockIndexResult {
  upserted: number;
  deleted: number;
}

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
  const rows = blocks.map((block) => ({
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
    metadata: block.metadata as unknown as Json,
  }));

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

  const { data: existingRows, error: selectError } = await supabase
    .from('content_blocks')
    .select('id')
    .eq('chapter_id', chapterId);
  if (selectError) {
    throw new Error(
      `upsertBlockIndex: upserted ${rows.length} block(s) OK, but failed to read existing blocks for chapter ` +
        `${chapterId} to find stale ones: ${selectError.message}`,
    );
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
