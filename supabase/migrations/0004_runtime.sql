-- 0004_runtime.sql
-- Runtime Studio + sandboxed code execution (MVP3, PRD §10).
--
-- Three tables layered on top of the Course -> Chapter -> Block hierarchy,
-- plus two job-claim RPCs the out-of-process worker uses:
--   - runtimes: a course-scoped container recipe (python version + conda /
--     pip / apt packages). Admins author/edit these; elevated course members
--     (author/instructor/admin) may read them so the authoring UI can pick a
--     runtime for an executable code block. A build turns the recipe into a
--     Docker image (image_tag) and flips status to 'ready'.
--   - runtime_builds: one row per build attempt. Worker claims queued rows,
--     streams the docker-build log back into `log`, and marks the build
--     succeeded/failed. On success it also flips the parent runtime to
--     'ready' + records image_tag.
--   - executions: the AUDIT LEDGER (PRD §10.5). Every Run of a code block
--     inserts a row here BEFORE the container runs, recording who ran what
--     against which runtime. Worker fills in stdout/stderr/exit_code/
--     duration_ms/status. Rows are never silently dropped.
--
-- SECURITY invariants (non-negotiable, PRD §10.5):
--   - Only author/instructor/admin course members may create runtimes'
--     builds or *queue an execution*. Students/anon match zero rows on
--     executions insert AND cannot even read runtimes -> no Run affordance.
--   - executions.executed_by is pinned to auth.uid() by the insert WITH CHECK,
--     so a caller can never attribute a run to someone else.
--   - A user may read only their OWN execution rows (or app_admins, for
--     moderation). The worker uses the service role, which bypasses RLS by
--     design (trusted server-side path, same stance as 0003's key reads).
--   - The actual sandbox hardening (--network none, non-root, memory/pids/cpu
--     caps, timeout) lives in the worker; this schema is the authz + audit
--     boundary that decides *whether* a run may be queued and by whom.

-- ---------------------------------------------------------------------------
-- runtimes (course-scoped container recipe)
-- ---------------------------------------------------------------------------

create table runtimes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  name text not null,
  python_version text not null default '3.11',
  base_image text not null default 'mambaorg/micromamba:1.5-jammy',
  conda_packages jsonb not null default '[]'::jsonb,
  pip_packages jsonb not null default '[]'::jsonb,
  apt_packages jsonb not null default '[]'::jsonb,
  dockerfile text,
  image_tag text,
  gpu_enabled boolean not null default false,
  memory_limit text not null default '512m',
  timeout_seconds int not null default 30,
  status text not null default 'draft'
    check (status in ('draft', 'building', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table runtimes is 'Course-scoped container recipe (python + conda/pip/apt packages). A build compiles it to a Docker image (image_tag) and flips status to ready. Authored by app_admins; readable by elevated course members.';

-- ---------------------------------------------------------------------------
-- runtime_builds (one row per build attempt)
-- ---------------------------------------------------------------------------

create table runtime_builds (
  id uuid primary key default gen_random_uuid(),
  runtime_id uuid references runtimes(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  log text not null default '',
  image_tag text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table runtime_builds is 'One docker-build attempt for a runtime. Worker claims queued rows (claim_runtime_build), streams the build log into `log`, and marks succeeded/failed. On success flips the parent runtime to ready + image_tag.';

-- ---------------------------------------------------------------------------
-- executions (audit ledger -- one row per Run, PRD §10.5)
-- ---------------------------------------------------------------------------

create table executions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid,
  chapter_id uuid,
  block_id text,
  runtime_id uuid references runtimes(id),
  code text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'timeout')),
  stdout text not null default '',
  stderr text not null default '',
  exit_code int,
  duration_ms int,
  executed_by uuid not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
comment on table executions is 'Audit ledger: one row per code-block Run (PRD §10.5). Inserted BEFORE the container runs; worker fills stdout/stderr (capped 64KB)/exit_code/duration_ms/status. executed_by pinned to auth.uid() by RLS -- a run can never be misattributed.';

-- FK columns aren't auto-indexed; the worker polls executions by status and
-- the reader loads runs by block, so index both access paths.
create index runtimes_course_id_idx on runtimes (course_id);
create index runtime_builds_runtime_id_idx on runtime_builds (runtime_id);
create index runtime_builds_status_created_idx on runtime_builds (status, created_at);
create index executions_status_created_idx on executions (status, created_at);
create index executions_block_id_idx on executions (block_id);
create index executions_executed_by_idx on executions (executed_by);

-- Keep updated_at honest on runtimes UPDATE (reuses the fn from 0002).
create trigger runtimes_set_updated_at
  before update on runtimes
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Job-claim RPCs (worker-only)
--
-- The worker runs a poll loop and needs to atomically grab ONE queued job
-- without two workers claiming the same row. `FOR UPDATE SKIP LOCKED` is the
-- canonical Postgres queue primitive, but PostgREST can't express the
-- select-then-update-returning dance, so we wrap each in an RPC. Both mutate
-- job state, so execute is granted to service_role ONLY (the worker); anon /
-- authenticated cannot call them.
-- ---------------------------------------------------------------------------

create or replace function public.claim_runtime_build()
returns setof runtime_builds
language plpgsql
as $$
declare
  claimed runtime_builds;
begin
  select * into claimed
  from runtime_builds
  where status = 'queued'
  order by created_at
  for update skip locked
  limit 1;

  if claimed.id is null then
    return;
  end if;

  update runtime_builds
  set status = 'running', started_at = now()
  where id = claimed.id
  returning * into claimed;

  return next claimed;
end;
$$;
comment on function public.claim_runtime_build is 'Worker-only: atomically claim one queued runtime_build (FOR UPDATE SKIP LOCKED), flip it to running, and return it. Empty set when the queue is empty.';

create or replace function public.claim_execution()
returns setof executions
language plpgsql
as $$
declare
  claimed executions;
begin
  select * into claimed
  from executions
  where status = 'queued'
  order by created_at
  for update skip locked
  limit 1;

  if claimed.id is null then
    return;
  end if;

  update executions
  set status = 'running'
  where id = claimed.id
  returning * into claimed;

  return next claimed;
end;
$$;
comment on function public.claim_execution is 'Worker-only: atomically claim one queued execution (FOR UPDATE SKIP LOCKED), flip it to running, and return it. Empty set when the queue is empty.';

-- Lock the claim RPCs down to the worker's service role. (Functions are
-- executable by PUBLIC by default; revoke first, then grant narrowly.)
revoke execute on function public.claim_runtime_build() from public;
revoke execute on function public.claim_execution() from public;
grant execute on function public.claim_runtime_build() to service_role;
grant execute on function public.claim_execution() to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Reuses the SECURITY DEFINER helpers from 0001 (is_course_member) and 0003
-- (is_app_admin) so these policies don't recurse through course_members' own
-- RLS. "Elevated" throughout = author | instructor | admin.
-- ---------------------------------------------------------------------------

alter table runtimes enable row level security;
alter table runtime_builds enable row level security;
alter table executions enable row level security;

-- runtimes: elevated course members (or platform admins) may READ; only
-- platform admins may create/edit. Students/anon see zero rows -> no Run UI.
create policy "runtimes_select" on runtimes
  for select
  using (
    public.is_course_member(course_id, array['author', 'instructor', 'admin'])
    or public.is_app_admin()
  );

create policy "runtimes_insert" on runtimes
  for insert
  with check (public.is_app_admin());

create policy "runtimes_update" on runtimes
  for update
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- runtime_builds: same visibility as their parent runtime; writes admin-only
-- (the worker updates via service role, bypassing RLS).
create policy "runtime_builds_select" on runtime_builds
  for select
  using (
    exists (
      select 1 from runtimes r
      where r.id = runtime_builds.runtime_id
        and (
          public.is_course_member(r.course_id, array['author', 'instructor', 'admin'])
          or public.is_app_admin()
        )
    )
  );

create policy "runtime_builds_insert" on runtime_builds
  for insert
  with check (public.is_app_admin());

create policy "runtime_builds_update" on runtime_builds
  for update
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- executions: an elevated course member may QUEUE a run, but only ever as
-- themselves (executed_by pinned to auth.uid()). A user may read only their
-- own rows (app_admins may read all, for moderation/audit). Students/anon
-- match zero rows on both insert and select.
create policy "executions_insert" on executions
  for insert
  with check (
    executed_by = auth.uid()
    and public.is_course_member(course_id, array['author', 'instructor', 'admin'])
  );

create policy "executions_select" on executions
  for select
  using (executed_by = auth.uid() or public.is_app_admin());

-- ---------------------------------------------------------------------------
-- Data API exposure
--
-- Same rationale as 0002/0003: Supabase no longer auto-grants DML on
-- postgres-owned public tables to the Data API roles, so PostgREST can't
-- reach these tables without an explicit GRANT (every request would 42501).
-- RLS above is the authorization boundary; these grants only let PostgREST
-- connect. service_role bypasses RLS by design (the trusted worker path).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
