import type { CourseRole } from '@/lib/supabase/roles';

/**
 * Options for `renderBlocks` (see `render-blocks.tsx`).
 */
export interface RenderOptions {
  /**
   * The viewer's role on the course that owns the blocks being rendered.
   * `null`/`undefined` covers a signed-out guest or a non-member -- both are
   * treated identically to `'student'` for visibility purposes (i.e. never
   * privileged). See `lib/auth/guards.ts`'s `canViewInstructorContent`,
   * which `renderBlocks` calls through to.
   */
  role: CourseRole | null | undefined;
}
