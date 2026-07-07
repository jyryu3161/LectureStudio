/**
 * Ingest the seeded chapter's MyST source: assign stable block ids
 * (idempotent — safe to re-run), write the updated source back to
 * `chapters.source`, and upsert the parsed block index into
 * `content_blocks`. This is what makes the seed chapter (supabase/seed.sql)
 * renderable with stable ids — `supabase db reset` loads the raw MyST text
 * but never populates `content_blocks` itself.
 *
 * Run with (no extra install needed — jiti already ships in node_modules):
 *   npx jiti scripts/ingest-seed.ts
 * or, if `tsx` happens to be available in your environment:
 *   npx tsx scripts/ingest-seed.ts
 *
 * Optionally pass a chapter id to ingest a different chapter:
 *   npx jiti scripts/ingest-seed.ts <chapter-uuid>
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (both in
 * .env.local for the local stack). This script runs outside any Next.js
 * request, so it cannot use lib/supabase/server.ts (which needs
 * next/headers `cookies()`); instead it talks to Supabase directly with
 * the service role key, the same trusted server-side pattern called out in
 * supabase/migrations/0001_init.sql's bootstrap note (bypasses RLS).
 */
import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';

import { upsertBlockIndex } from '../lib/content/db';
import { ensureStableIds } from '../lib/content/stable-ids';
import type { Database } from '../lib/supabase/types';

const SEED_CHAPTER_ID = '33333333-3333-3333-3333-333333333333';

function loadEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'ingest-seed: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment. ' +
        'Load .env.local first, e.g.: env $(grep -v "^#" .env.local | xargs) npx jiti scripts/ingest-seed.ts',
    );
  }
  return { url, serviceRoleKey };
}

async function main(): Promise<void> {
  const { url, serviceRoleKey } = loadEnv();
  const chapterId = process.argv[2] ?? SEED_CHAPTER_ID;

  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // This script only ever does plain REST calls (.select/.update/.upsert/
    // .delete) — it never opens a Realtime channel. supabase-js still
    // constructs a RealtimeClient eagerly in createClient() though, which
    // (on Node < 22, with no `transport` supplied) probes for a global
    // `WebSocket` and throws if it's missing. Supplying any non-null
    // `transport` short-circuits that probe (see
    // node_modules/@supabase/realtime-js/dist/module/RealtimeClient.js
    // `_initializeOptions`, `options?.transport ?? getWebSocketConstructor()`)
    // — it is never actually invoked since nothing here connects.
    realtime: {
      transport: class NoopSocketNeverUsed {},
    } as unknown as SupabaseClientOptions<'public'>['realtime'],
  });

  const { data: chapter, error: fetchError } = await supabase
    .from('chapters')
    .select('id, course_id, version_id, source')
    .eq('id', chapterId)
    .single();

  if (fetchError || !chapter) {
    throw new Error(
      `ingest-seed: could not load chapter ${chapterId}: ${fetchError?.message ?? 'not found'}`,
    );
  }

  const { source: updatedSource, blocks } = ensureStableIds(chapter.source);
  const sourceChanged = updatedSource !== chapter.source;

  if (sourceChanged) {
    const { error: updateError } = await supabase
      .from('chapters')
      .update({ source: updatedSource })
      .eq('id', chapterId);
    if (updateError) {
      throw new Error(
        `ingest-seed: failed to write stable-id markers back to chapters.source for ${chapterId}: ${updateError.message}`,
      );
    }
  }

  const result = await upsertBlockIndex(
    supabase,
    chapterId,
    chapter.course_id,
    chapter.version_id,
    blocks,
  );

  console.log(
    `ingest-seed: chapter ${chapterId} -> ${blocks.length} block(s) parsed ` +
      `(${result.upserted} upserted, ${result.deleted} stale deleted); ` +
      `source ${sourceChanged ? 'updated with stable-id markers' : 'unchanged (already stable)'}.`,
  );
  for (const block of blocks) {
    const flag = block.visibility === 'instructor' ? ', instructor-only' : '';
    console.log(
      `  [${block.order}] ${block.id}  ${block.blockType}${flag}  hash=${block.contentHash.slice(0, 12)}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
