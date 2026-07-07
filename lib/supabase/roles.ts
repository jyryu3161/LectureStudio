/**
 * Course role vocabulary, mirroring the DB check constraint on
 * `course_members.role` (see supabase/migrations/0001_init.sql). This is
 * the single source of truth for the literal role type -- `Database`'s
 * generated `course_members.Row.role` is a plain `string`, so anything
 * that needs the narrowed union (or to validate a value read from the DB)
 * should go through here rather than re-declaring the list elsewhere.
 */
export const COURSE_ROLES = ['admin', 'author', 'instructor', 'student'] as const;

export type CourseRole = (typeof COURSE_ROLES)[number];

/** Narrows an unknown DB value (e.g. `course_members.role`) to `CourseRole`. */
export function isCourseRole(value: string | null | undefined): value is CourseRole {
  return !!value && (COURSE_ROLES as readonly string[]).includes(value);
}
