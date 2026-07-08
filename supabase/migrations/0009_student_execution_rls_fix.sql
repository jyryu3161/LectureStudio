-- ---------------------------------------------------------------------------
-- 0009_student_execution_rls_fix.sql — close two RLS gaps left by 0008
--
-- 0008 added the per-course student-execution opt-in and widened the executions
-- INSERT policy, but two policies were left inconsistent with the stated gate:
--
--  (A) runtimes_select still only admitted elevated members / app_admins. An
--      opted-in student therefore saw ZERO 'ready' runtimes, so the reader Run
--      button rendered permanently disabled ('준비된 런타임 없음') and even a
--      forced click failed at runtime resolution ('No ready runtime …'). Both
--      the readiness probe (resolveRunContextAction) and runtime resolution
--      (queueExecution) run on the student's RLS-scoped client, so neither could
--      ever see the image the student is now allowed to run against.
--
--  (B) executions_insert's widened student branch checked membership + course
--      opt-in but NOT that the target block is an executable code block. A
--      student could thus INSERT an execution with arbitrary code / block_id via
--      REST (the app-layer executable gate was the only thing stopping it),
--      exceeding the stated student gate.
--
-- This migration tightens visibility only for the exact opted-in-student case
-- and re-adds the executable-block requirement to the student INSERT branch.
-- The sandbox flags, executed_by pin, elevated-role paths, and the rate-limit
-- trigger are all UNCHANGED.
-- ---------------------------------------------------------------------------

-- (A) Let an opted-in student SEE only the 'ready' runtimes of a course that has
--     enabled student execution — nothing else. Draft/building/errored runtimes
--     and courses with the flag off still match zero rows for students. Elevated
--     members and app_admins keep full visibility as before.
drop policy if exists "runtimes_select" on runtimes;
create policy "runtimes_select" on runtimes
  for select
  using (
    public.is_course_member(course_id, array['author', 'instructor', 'admin'])
    or public.is_app_admin()
    or (
      status = 'ready'
      and public.is_course_member(course_id, array['student'])
      and exists (
        select 1 from courses c
        where c.id = runtimes.course_id
          and c.student_execution_enabled
      )
    )
  );

-- (B) Re-create executions_insert so the opt-in student branch also requires the
--     target block to be an executable code block in the SAME course. The
--     elevated-role branch and the executed_by pin are unchanged.
drop policy if exists "executions_insert" on executions;
create policy "executions_insert" on executions
  for insert
  with check (
    executed_by = auth.uid()
    and (
      -- elevated members: unchanged (arbitrary code by design)
      public.is_course_member(course_id, array['author', 'instructor', 'admin'])
      -- opt-in students: member as 'student', course opted in, AND the target
      -- block is a server-verified executable code block of this course.
      or (
        public.is_course_member(course_id, array['student'])
        and exists (
          select 1 from courses c
          where c.id = executions.course_id
            and c.student_execution_enabled
        )
        and exists (
          select 1 from content_blocks b
          where b.id = executions.block_id
            and b.course_id = executions.course_id
            and b.block_type = 'code'
            and (b.metadata->>'executable')::boolean is true
        )
      )
    )
  );
