import { createClient } from '@/lib/supabase/server';
import { isCourseRole, type CourseRole } from '@/lib/supabase/roles';
import type { User } from '@supabase/supabase-js';

/**
 * Server-only session helpers. Both functions create a fresh Supabase
 * server client per call (per `lib/supabase/server.ts` guidance) and read
 * the session from request cookies -- safe to call from Server Components,
 * Route Handlers, and Server Actions, never from a Client Component.
 */

/** Returns the current authenticated user, or `null` if signed out. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Looks up the current user's role on a specific course via
 * `course_members`. Returns `null` when signed out, not a member, or the
 * stored role value doesn't match the known role vocabulary.
 *
 * This performs a plain authenticated read -- RLS still applies (a user can
 * always read their own membership row; see the `course_members_select`
 * policy), so this reflects exactly what the DB would allow, not a
 * separately-trusted decision.
 */
export async function getCourseRole(courseId: string): Promise<CourseRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('course_members')
    .select('role')
    .eq('course_id', courseId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;
  return isCourseRole(data.role) ? data.role : null;
}
