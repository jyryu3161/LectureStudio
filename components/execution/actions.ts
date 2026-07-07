'use server';

/**
 * Server Actions for the code-execution UI (PRD §11.3) — the client-callable
 * surface for the authoring "실행 가능" (executable) toggle and the reader
 * "실행" (Run) button.
 *
 * SECURITY: every function here re-derives authorization server-side and rides
 * RLS on top; a client claim is never trusted.
 *   - resolveRunContext / getBlockMeta / updateBlockMeta all re-check the
 *     caller's course role from the DB.
 *   - The actual run authorization + audit insert lives in lib/runtime
 *     (queueExecution), which this UI consumes separately — nothing here can
 *     queue a run.
 *
 * The executable flag persists in content_blocks.metadata.executable (jsonb).
 * A chapter re-save overwrites that column with freshly-parsed metadata, so
 * lib/content/db.ts's upsertBlockIndex explicitly preserves the `executable`
 * key across saves (see PRESERVED_METADATA_KEYS there).
 */
import { getCurrentUser, getCourseRole } from '@/lib/auth/session';
import type { CourseRole } from '@/lib/supabase/roles';
import { createClient } from '@/lib/supabase/server';

import type { ActionResult, BlockMetaState, RunContext } from './types';

/** Roles that may RUN code / see the Run affordance (PRD §10.5; mirrors executions_insert RLS). */
const RUN_ROLES: readonly CourseRole[] = ['author', 'instructor', 'admin'];
/** Roles that may TOGGLE executability (mirrors content_blocks_write RLS: author/admin only). */
const AUTHORING_ROLES: readonly CourseRole[] = ['author', 'admin'];

function hasRole(role: CourseRole | null, allowed: readonly CourseRole[]): boolean {
  return role != null && allowed.includes(role);
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

/**
 * Resolve everything the reader Run button needs from a block id, entirely
 * server-side. Fails closed to `{ runnable: false }` for any missing
 * precondition so the client renders no control. Never throws (a thrown auth
 * error would otherwise surface as a client crash for a perfectly ordinary
 * "not allowed" case).
 */
export async function resolveRunContextAction(blockId: string): Promise<RunContext> {
  try {
    const user = await getCurrentUser();
    if (!user) return { runnable: false };

    const supabase = await createClient();
    const { data: block, error } = await supabase
      .from('content_blocks')
      .select('id, course_id, chapter_id, block_type, metadata')
      .eq('id', blockId)
      .maybeSingle();
    if (error || !block) return { runnable: false };
    if (block.block_type !== 'code') return { runnable: false };

    const metadata = (block.metadata ?? {}) as Record<string, unknown>;
    if (metadata.executable !== true) return { runnable: false };

    const courseId = block.course_id;
    const chapterId = block.chapter_id;
    if (!courseId || !chapterId) return { runnable: false };

    const role = await getCourseRole(courseId);
    if (!hasRole(role, RUN_ROLES)) return { runnable: false };

    // A run needs a built image to exist; otherwise the button is shown
    // disabled (the client decides the copy) rather than queuing against a
    // runtime that isn't there.
    const { data: runtimes } = await supabase
      .from('runtimes')
      .select('id')
      .eq('course_id', courseId)
      .eq('status', 'ready')
      .not('image_tag', 'is', null)
      .limit(1);
    const runtimeReady = Array.isArray(runtimes) && runtimes.length > 0;

    return { runnable: true, chapterId, runtimeReady };
  } catch {
    return { runnable: false };
  }
}

/**
 * Read the current executable state of a block for the authoring Block
 * Inspector toggle. `exists: false` means no persisted row yet (chapter
 * unsaved), so the toggle can prompt the author to save first instead of
 * silently no-op'ing.
 */
export async function getBlockMetaAction(blockId: string): Promise<ActionResult<BlockMetaState>> {
  try {
    const supabase = await createClient();
    const { data: block, error } = await supabase
      .from('content_blocks')
      .select('id, metadata')
      .eq('id', blockId)
      .maybeSingle();
    if (error) {
      throw new Error(`블록 정보를 불러오지 못했습니다: ${error.message}`);
    }
    if (!block) {
      return { ok: true, data: { exists: false, executable: false } };
    }
    const metadata = (block.metadata ?? {}) as Record<string, unknown>;
    return { ok: true, data: { exists: true, executable: metadata.executable === true } };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Persist a block's executable flag into content_blocks.metadata.executable.
 * Author/admin on the block's course only (also enforced by content_blocks_write
 * RLS). Rejects non-code blocks. Returns the resulting state so the client can
 * confirm the persisted value rather than assume its optimistic one.
 */
export async function updateBlockMetaAction(
  blockId: string,
  executable: boolean,
): Promise<ActionResult<BlockMetaState>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('로그인이 필요합니다.');
    }

    const supabase = await createClient();
    const { data: block, error: loadError } = await supabase
      .from('content_blocks')
      .select('id, course_id, block_type, metadata')
      .eq('id', blockId)
      .maybeSingle();
    if (loadError) {
      throw new Error(`블록 정보를 불러오지 못했습니다: ${loadError.message}`);
    }
    if (!block) {
      throw new Error('블록을 찾을 수 없습니다. 먼저 저장하세요.');
    }
    if (block.block_type !== 'code') {
      throw new Error('코드 블록만 실행 가능으로 설정할 수 있습니다.');
    }
    if (!block.course_id) {
      throw new Error('블록이 강의에 연결되어 있지 않습니다.');
    }

    const role = await getCourseRole(block.course_id);
    if (!hasRole(role, AUTHORING_ROLES)) {
      throw new Error('작성자 또는 관리자만 실행 가능 여부를 변경할 수 있습니다.');
    }

    const metadata = (block.metadata ?? {}) as Record<string, unknown>;
    const nextMetadata = { ...metadata, executable: Boolean(executable) };

    const { error: updateError } = await supabase
      .from('content_blocks')
      .update({ metadata: nextMetadata })
      .eq('id', blockId);
    if (updateError) {
      throw new Error(`실행 가능 설정을 저장하지 못했습니다: ${updateError.message}`);
    }

    return { ok: true, data: { exists: true, executable: Boolean(executable) } };
  } catch (error) {
    return fail(error);
  }
}
