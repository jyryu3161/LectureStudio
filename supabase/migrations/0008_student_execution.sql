-- ---------------------------------------------------------------------------
-- 0008_student_execution.sql — opt-in student code execution + rate limit
--
-- MVP6 (PRD §10.5 extension). By default only elevated course members
-- (author/instructor/admin) may run code. This migration adds a PER-COURSE
-- opt-in so an instructor/admin can let *students* run the executable code
-- blocks of that one course — without ever weakening the sandbox, the
-- executed_by pin, or the runtime gate.
--
-- Effective run gate (enforced server-side in lib/runtime + here in RLS):
--     role in (author,instructor,admin)
--   OR (role = student AND courses.student_execution_enabled AND
--       block.metadata.executable)                         -- executable
--                                                              re-checked in app
--
-- Anti-abuse: a student may hold at most ONE in-flight (queued|running)
-- execution at a time; a 2nd concurrent attempt is rejected. Elevated roles
-- get a higher ceiling. Primary enforcement is the app (clean Korean error);
-- the trigger below is the DB-level defense-in-depth.
-- ---------------------------------------------------------------------------

-- 1) Per-course opt-in flag. Defaults false → no behaviour change for existing
--    courses. Covered for UPDATE by the existing courses_write policy
--    (author/admin members) and by courses_admin_update added below (app_admins).
alter table courses
  add column student_execution_enabled boolean not null default false;
comment on column courses.student_execution_enabled is
  'Opt-in: when true, student members of this course may run executable code blocks (PRD §10.5). Default false. Sandbox flags & rate limit unchanged.';

-- 2) Let platform admins toggle course settings (incl. the flag above) from the
--    Admin surface even when they are not an author/admin *member* of the
--    course. Additive/permissive: does NOT relax the existing courses_write
--    policy, only OR-adds an app_admin path for UPDATE.
create policy "courses_admin_update" on courses
  for update
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- 3) Widen the executions INSERT policy to admit the opt-in student path while
--    KEEPING the elevated-role path unchanged. executed_by stays pinned to
--    auth.uid() (a run can never be misattributed). Students of a course whose
--    flag is off, or non-members, still match zero rows.
--    (executions_select is unchanged: `executed_by = auth.uid() or is_app_admin()`
--     already lets a student read their own execution rows for polling.)
drop policy if exists "executions_insert" on executions;
create policy "executions_insert" on executions
  for insert
  with check (
    executed_by = auth.uid()
    and (
      -- elevated members: unchanged
      public.is_course_member(course_id, array['author', 'instructor', 'admin'])
      -- opt-in students: member as 'student' AND the course has enabled it
      or (
        public.is_course_member(course_id, array['student'])
        and exists (
          select 1 from courses c
          where c.id = executions.course_id
            and c.student_execution_enabled
        )
      )
    )
  );

-- 4) Rate limit (defense-in-depth). Rationale for a TRIGGER over a partial
--    unique index: a partial unique index on executed_by WHERE status in
--    ('queued','running') would cap EVERY user at exactly one in-flight run,
--    including elevated authors/instructors — too blunt (they are not
--    rate-limited). A trigger can vary the ceiling by role: students → 1,
--    elevated → 3. A transaction-scoped advisory lock keyed on the executor
--    serializes concurrent inserts by the same user so the count can't be
--    raced past the cap. The app (lib/runtime.queueExecution) is the primary
--    gate and returns a clean Korean message; this fires only if that is
--    bypassed.
create or replace function public.enforce_execution_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  in_flight int;
  ceiling int;
begin
  -- Only in-flight rows count against the limit; terminal runs are free.
  -- Serialize concurrent inserts by the same executor to close the count race.
  perform pg_advisory_xact_lock(hashtext(new.executed_by::text));

  -- Elevated members of the target course get a higher ceiling; everyone else
  -- (students under the opt-in) is capped at a single in-flight run.
  if public.is_course_member(new.course_id, array['author', 'instructor', 'admin']) then
    ceiling := 3;
  else
    ceiling := 1;
  end if;

  select count(*) into in_flight
  from executions
  where executed_by = new.executed_by
    and status in ('queued', 'running');

  if in_flight >= ceiling then
    raise exception 'execution rate limit reached (% in flight, ceiling %)', in_flight, ceiling
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
comment on function public.enforce_execution_rate_limit is
  'BEFORE INSERT on executions: caps in-flight (queued|running) runs per user (student 1, elevated 3). Defense-in-depth behind lib/runtime.queueExecution.';

create trigger executions_rate_limit
  before insert on executions
  for each row
  execute function public.enforce_execution_rate_limit();
