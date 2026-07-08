/**
 * Course-lifecycle helpers (multi-term reuse, PRD §10). Server-only — the
 * duplication action and its trusted reads must never be imported from a
 * Client Component.
 */
export { duplicateCourseForTerm } from './duplicate';
export type {
  ActionResult,
  DuplicateCourseInput,
  DuplicateCourseResult,
} from './duplicate';
export {
  remapBlockMetadataDemoId,
  remapDemoDirectives,
  remapSourceMarkers,
  rewriteChapterSource,
} from './rewrite';
