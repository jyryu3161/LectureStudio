-- 0005_demos.sql
-- Marimo interactive demos (MVP4, PRD §4.7 / §5.5 interactive-demo block).
--
-- A demo is a marimo notebook exported to a self-contained WASM bundle
-- (`marimo export html-wasm --mode run`) and uploaded to a PUBLIC Storage
-- bucket. Students never touch this table — they only ever load the public
-- iframe URL embedded in published content (sandbox="allow-scripts
-- allow-downloads", NO allow-same-origin: viewing runs Pyodide client-side,
-- no server execution). Authoring/building is elevated-member-only.
--
-- Layered on the same Course -> ... hierarchy and the same job-claim pattern
-- as 0004_runtime.sql:
--   - marimo_apps: one row per demo. Elevated course members (author/
--     instructor/admin) or app_admins may read/create/update; students/anon
--     match zero rows. A build turns `source` into a WASM bundle uploaded to
--     Storage under demos/<appId>/ and flips status draft -> building ->
--     ready|failed, recording bundle_path (the bucket-relative index.html key).
--   - claim_marimo_build(): worker-only RPC, atomically claims one 'building'
--     row (FOR UPDATE SKIP LOCKED) exactly like claim_runtime_build().
--
-- SECURITY invariants:
--   - Only elevated course members may author/queue a demo build; the worker
--     (service_role) bypasses RLS to update status/bundle_path.
--   - The 'demos' Storage bucket is PUBLIC (read) but writable only by
--     service_role — the iframe embed hits the public object URL, while only
--     the trusted worker can upload bundles.

-- ---------------------------------------------------------------------------
-- marimo_apps
-- ---------------------------------------------------------------------------

create table marimo_apps (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  name text not null,
  source text not null,
  status text not null default 'draft'
    check (status in ('draft', 'building', 'ready', 'failed')),
  bundle_path text,
  log text not null default '',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table marimo_apps is 'A marimo notebook (source) exported to a WASM bundle in the public "demos" bucket. status draft->building->ready|failed; bundle_path is the bucket-relative index.html key. Authored/built by elevated course members; students only ever load the public iframe URL.';

-- Worker polls building rows by status; the renderer resolves a demo by id
-- (PK, already indexed) and lists per course.
create index marimo_apps_course_id_idx on marimo_apps (course_id);
create index marimo_apps_status_created_idx on marimo_apps (status, created_at);

-- Keep updated_at honest on UPDATE (reuses the fn from 0002_lecture.sql).
create trigger marimo_apps_set_updated_at
  before update on marimo_apps
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Job-claim RPC (worker-only) — same FOR UPDATE SKIP LOCKED primitive and
-- service_role-only lockdown as claim_runtime_build()/claim_execution() in
-- 0004_runtime.sql. Claims a row already flipped to 'building' by the author's
-- queueDemoBuild (so the UI shows "building" immediately); the worker only
-- picks up rows that haven't been claimed yet — it distinguishes unclaimed
-- from in-flight via started-tracking? No: like runtime builds, 'building' is
-- the queued state and the claim is a no-op status re-stamp guarded by SKIP
-- LOCKED, so two workers never grab the same row. bundle_path stays null until
-- success, which is the "not yet built" signal.
-- ---------------------------------------------------------------------------

create or replace function public.claim_marimo_build()
returns setof marimo_apps
language plpgsql
as $$
declare
  claimed marimo_apps;
begin
  select * into claimed
  from marimo_apps
  where status = 'building' and bundle_path is null
  order by updated_at
  for update skip locked
  limit 1;

  if claimed.id is null then
    return;
  end if;

  -- Re-stamp updated_at so the stale-build sweep can tell how long this row
  -- has been in flight (mirrors runtime_builds.started_at semantics).
  update marimo_apps
  set updated_at = now()
  where id = claimed.id
  returning * into claimed;

  return next claimed;
end;
$$;
comment on function public.claim_marimo_build is 'Worker-only: atomically claim one queued marimo_app build (status=building, bundle_path null) via FOR UPDATE SKIP LOCKED, touch updated_at, and return it. Empty set when none pending.';

revoke execute on function public.claim_marimo_build() from public;
grant execute on function public.claim_marimo_build() to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Reuses is_course_member (0001) and is_app_admin (0003). "Elevated" =
-- author | instructor | admin. Students/anon match zero rows.
-- ---------------------------------------------------------------------------

alter table marimo_apps enable row level security;

create policy "marimo_apps_select" on marimo_apps
  for select
  using (
    public.is_course_member(course_id, array['author', 'instructor', 'admin'])
    or public.is_app_admin()
  );

create policy "marimo_apps_insert" on marimo_apps
  for insert
  with check (
    created_by = auth.uid()
    and (
      public.is_course_member(course_id, array['author', 'instructor', 'admin'])
      or public.is_app_admin()
    )
  );

create policy "marimo_apps_update" on marimo_apps
  for update
  using (
    public.is_course_member(course_id, array['author', 'instructor', 'admin'])
    or public.is_app_admin()
  )
  with check (
    public.is_course_member(course_id, array['author', 'instructor', 'admin'])
    or public.is_app_admin()
  );

-- ---------------------------------------------------------------------------
-- Data API exposure (same rationale as 0002/0003/0004): explicit grants so
-- PostgREST can reach the table; RLS above is the authorization boundary.
-- service_role bypasses RLS by design (the trusted worker path).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage: public "demos" bucket for WASM bundles.
--
-- public=true makes objects readable via the public object URL (the iframe
-- src) without an RLS SELECT policy. We still add an explicit public-read
-- policy on this bucket's objects (defense in depth / contract), and rely on
-- RLS-on + no write policy to deny anon/authenticated writes — only the
-- worker's service_role (which bypasses RLS) can upload bundles.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('demos', 'demos', true)
on conflict (id) do nothing;

create policy "demos_public_read" on storage.objects
  for select
  using (bucket_id = 'demos');
