'use server';

import { summarizeBlocks } from '@/app/authoring/_lib/preview';
import type {
  ReloadChapterSourceInput,
  ReloadChapterSourceResult,
  SaveChapterInput,
  SaveChapterResult,
} from '@/components/authoring/types';
import { MAX_CHAPTER_SOURCE_LENGTH } from '@/components/authoring/types';
import { canEditCourse } from '@/lib/auth/guards';
import { getCourseRole, getCurrentUser } from '@/lib/auth/session';
import { readChapterSource } from '@/lib/chapters/source';
import { ensureStableIds, parseWithWarnings, upsertBlockIndex, type ParseWarning } from '@/lib/content';
import { createClient } from '@/lib/supabase/server';

/**
 * Server Action backing the Authoring Studio's Save button (PRD §5.3/§6.1),
 * passed down to the Client Component as the `onSave` prop (see
 * app/authoring/[courseSlug]/[chapterSlug]/page.tsx).
 *
 *  1. Re-checks auth + the `canEditCourse` role server-side. A Server
 *     Action is a public endpoint under the hood, so the page's
 *     client-side role gate must never be the only check (defense in
 *     depth, matching lib/auth/guards.ts's own doc comment).
 *  2. `ensureStableIds` assigns/keeps every top-level block's stable id
 *     (PRD §5.3) and injects any missing `<!-- blk:... -->` markers into
 *     the source it returns.
 *  3. Writes the *returned* (possibly marker-augmented) source -- never
 *     the raw input -- to `chapters.source`, then writes its blocks
 *     through to the `content_blocks` index via `upsertBlockIndex`.
 *  4. Hands the augmented source back to the caller. The caller MUST
 *     replace its editor buffer with it: otherwise the next save would
 *     see the original, marker-less text again and mint brand-new ids for
 *     every block on every single save, breaking the very invariant this
 *     function exists to uphold (see lib/content/stable-ids.ts).
 *
 * Never fails silently: every error path returns `{ ok: false, error }`
 * instead of throwing, so the caller can surface it (PRD data-loss
 * handling -- a failed save must be unmistakable, not swallowed).
 */
export async function saveChapterSource(input: SaveChapterInput): Promise<SaveChapterResult> {
  const { courseId, chapterId, versionId, source } = input;

  if (typeof source !== 'string') {
    return { ok: false, error: 'Source must be a string.' };
  }
  if (source.length > MAX_CHAPTER_SOURCE_LENGTH) {
    return {
      ok: false,
      error: `Source is too large (max ${MAX_CHAPTER_SOURCE_LENGTH.toLocaleString()} characters).`,
    };
  }
  if (!courseId || !chapterId) {
    return { ok: false, error: 'Missing course or chapter id.' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: 'You must be signed in to save.' };
  }

  const role = await getCourseRole(courseId);
  if (!canEditCourse(role)) {
    return { ok: false, error: 'You do not have permission to edit this course.' };
  }

  const { source: nextSource, blocks } = ensureStableIds(source);

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from('chapters')
    .update({ source: nextSource, updated_at: new Date().toISOString() })
    .eq('id', chapterId)
    .eq('course_id', courseId);

  if (updateError) {
    return { ok: false, error: `Failed to save chapter source: ${updateError.message}` };
  }

  try {
    await upsertBlockIndex(supabase, chapterId, courseId, versionId, blocks);
  } catch (error) {
    // The source text itself is already saved at this point -- say so
    // explicitly instead of reporting a generic failure, since the author
    // needs to know their prose is safe even though the block index (used
    // by the Inspector, and later Lecture Mode/annotations) may be stale.
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Source saved, but updating the block index failed: ${message}` };
  }

  return {
    ok: true,
    source: nextSource,
    blocks: summarizeBlocks(blocks),
    warnings: safeParseWarnings(nextSource),
    savedAt: new Date().toISOString(),
  };
}

/**
 * Re-reads the canonical `chapters.source` from the DB, role-gated.
 *
 * Used by the Authoring Studio after an AI draft is approved: approving appends
 * the draft's MyST to the chapter source and injects stable-id markers
 * server-side (lib/ai/artifacts.approveArtifact). The client cannot reconstruct
 * that canonical text (it doesn't know the newly minted marker ids), so it must
 * read it back here and replace its editor buffer with it -- otherwise the next
 * save would re-mint ids for the appended blocks and desync the block index.
 *
 * Never throws: returns `{ ok: false, error }` so the caller can surface it.
 */
export async function reloadChapterSource(
  input: ReloadChapterSourceInput,
): Promise<ReloadChapterSourceResult> {
  const { courseId, chapterId } = input;

  if (!courseId || !chapterId) {
    return { ok: false, error: 'Missing course or chapter id.' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: 'You must be signed in.' };
  }

  const role = await getCourseRole(courseId);
  if (!canEditCourse(role)) {
    return { ok: false, error: 'You do not have permission to view this chapter.' };
  }

  // Confirm the chapter exists and belongs to this course via the request-scoped
  // (RLS) client — `source` itself is no longer REST-readable (migration 0007).
  const supabase = await createClient();
  const { data: chapter, error } = await supabase
    .from('chapters')
    .select('id')
    .eq('id', chapterId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: `Failed to reload chapter source: ${error.message}` };
  }
  if (!chapter) {
    return { ok: false, error: 'Chapter not found (or you cannot access it).' };
  }

  // The canEditCourse gate above authorized this author; read the full source
  // (authors may see instructor notes) via the elevated helper.
  const sourceRow = await readChapterSource(chapter.id);
  if (sourceRow == null) {
    return { ok: false, error: 'Chapter not found (or you cannot access it).' };
  }

  return { ok: true, source: sourceRow.source };
}

/** A second, diagnostics-only parse pass -- must never fail the save itself. */
function safeParseWarnings(source: string): ParseWarning[] {
  try {
    return parseWithWarnings(source).warnings;
  } catch {
    return [];
  }
}
