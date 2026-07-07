/**
 * Shared, framework-neutral types for the code-execution UI (PRD §11.3).
 *
 * Kept in a plain module (NOT the 'use server' actions file, whose runtime
 * exports must all be async functions) so both the server actions and the
 * client Run button / toggle can import them without tripping the 'use
 * server' export restriction or bundling any server-only code.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * What the reader's Run button needs to know about a single code block,
 * resolved server-side from the block id alone. `runnable: false` collapses
 * every "no affordance" case (signed out, student/guest, non-code block, not
 * flagged executable, block not saved yet) into one — the client renders
 * nothing at all, so students never see a new control.
 */
export type RunContext =
  | { runnable: false }
  | { runnable: true; chapterId: string; runtimeReady: boolean };

/** Current executable state of a block, for the authoring Block Inspector toggle. */
export interface BlockMetaState {
  /** Whether a persisted content_blocks row exists (i.e. the chapter has been saved). */
  exists: boolean;
  executable: boolean;
}
