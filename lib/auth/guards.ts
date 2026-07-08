import type { CourseRole } from '@/lib/supabase/roles';

/**
 * Authorization policy helpers, layered on top of the raw `CourseRole`
 * looked up via `lib/auth/session.ts`.
 *
 * IMPORTANT (PRD Sec 5.6 / 15.3 security invariant): these are
 * defense-in-depth, mirroring the `content_blocks_select` RLS policy in
 * supabase/migrations/0001_init.sql. The DB is the actual enforcement
 * point -- a student's Postgres role can never select an
 * `instructor`-visibility row, full stop. Callers should still use these
 * guards to avoid ever *querying for* or *rendering* instructor-only
 * content on a student's behalf in the first place (fail closed, don't
 * rely on RLS alone to hide something you already fetched).
 */

/** Roles allowed to see `visibility = 'instructor'` content (e.g. instructor-note blocks). */
export function canViewInstructorContent(role: CourseRole | null | undefined): boolean {
  return role === 'author' || role === 'instructor' || role === 'admin';
}

/** Roles allowed to create/edit a course's chapters and content (Authoring Studio). */
export function canEditCourse(role: CourseRole | null | undefined): boolean {
  return role === 'author' || role === 'admin';
}

/** Elevated roles that may always run code (PRD §10.5), independent of any opt-in. */
export function isElevatedRunRole(role: CourseRole | null | undefined): boolean {
  return role === 'author' || role === 'instructor' || role === 'admin';
}

/**
 * THE effective code-execution gate (PRD §10.5), as a pure, testable function.
 * Mirrored by the `executions_insert` RLS policy (migration 0008) and the
 * server-side re-check in `lib/runtime.queueExecution` — three layers agreeing.
 *
 * A block may be run when it is server-verified executable AND either the
 * caller holds an elevated role, OR the caller is a student of a course that
 * has explicitly opted in (`courses.student_execution_enabled`). Every other
 * case (guest, un-opted student, non-executable block) fails closed.
 */
export function canRunCode(params: {
  role: CourseRole | null | undefined;
  blockExecutable: boolean;
  studentExecutionEnabled: boolean;
}): boolean {
  const { role, blockExecutable, studentExecutionEnabled } = params;
  if (!blockExecutable) return false;
  if (isElevatedRunRole(role)) return true;
  if (role === 'student') return studentExecutionEnabled === true;
  return false;
}

/**
 * Who may flip a course's `student_execution_enabled` toggle: an author/admin
 * member of that course, or a platform admin. Mirrors the `courses_write` +
 * `courses_admin_update` RLS policies (migrations 0001 / 0008).
 */
export function canToggleStudentExecution(
  role: CourseRole | null | undefined,
  isAppAdmin: boolean,
): boolean {
  return isAppAdmin || role === 'author' || role === 'admin';
}

/** Roles allowed to manage course membership/roles. */
export function canManageMembers(role: CourseRole | null | undefined): boolean {
  return role === 'admin';
}

/** True for any recognized course membership (any role at all). */
export function isCourseMember(role: CourseRole | null | undefined): boolean {
  return role != null;
}

/**
 * Filters a list of visibility-bearing rows (typically `content_blocks`)
 * down to what `role` may see. Always call this on server-fetched data
 * before it reaches a student/guest response or render -- never gate
 * instructor-only content with CSS alone (PRD Sec 5.6).
 */
export function filterByVisibility<T extends { visibility: string }>(
  items: readonly T[],
  role: CourseRole | null | undefined,
): T[] {
  if (canViewInstructorContent(role)) return [...items];
  return items.filter((item) => item.visibility !== 'instructor');
}
