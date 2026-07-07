-- 0003_ai.sql
-- AI Authoring Assistant (MVP2): provider settings, encrypted-at-rest API
-- keys, and the draft-gated artifact store (PRD §9).
--
-- Four tables layered on top of the Course -> Chapter -> Block hierarchy:
--   - app_admins: a tiny allow-list of platform administrators. Only they
--     may read/write API keys or switch the active AI provider. Seeded via
--     the trusted service-role path (scripts/dev-users.ts) -- never by a
--     client. A user may read *their own* row (to discover they are an
--     admin); everything else is service-role-only.
--   - ai_settings: a single-row (id=1) table naming the active provider.
--     Not a secret (no keys here), so any authenticated user may read it;
--     only admins may change it.
--   - ai_provider_keys: the ONLY place raw provider API keys live. RLS locks
--     every operation to app_admins, so students/authors/anon get zero rows
--     even if a query reaches the table. Keys are read exclusively in server
--     code and never returned to the client (see lib/ai/settings.ts).
--   - ai_artifacts: every generation is stored here as status='draft' BEFORE
--     any use (PRD §9.2 draft gate). Drafts never touch chapters.source; an
--     explicit approve action is what inserts the output into the source.
--     Visible/writable only to author/admin members of the owning course.
--
-- SECURITY invariant: API keys must never leak to a non-admin. Enforced at
-- the RLS layer here (defense in depth), not just in the server API -- the
-- same stance as content_blocks' instructor-note protection in 0001.

-- ---------------------------------------------------------------------------
-- app_admins
-- ---------------------------------------------------------------------------

create table app_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);
comment on table app_admins is 'Platform administrators. Only these users may manage AI provider keys / active provider. Seeded service-role-side (scripts/dev-users.ts); no client writes.';

alter table app_admins enable row level security;

-- A user may check their own admin status; no one may see the full list,
-- and there is deliberately NO insert/update/delete policy, so all writes
-- are denied for anon/authenticated. Seeding goes through the service role
-- (bypasses RLS) exactly like the course bootstrap in 0001.
create policy "app_admins_select_self" on app_admins
  for select
  using (user_id = auth.uid());

-- Reusable predicate: is the current caller a platform admin? SECURITY
-- DEFINER so policies on OTHER tables can consult app_admins without being
-- blocked by app_admins' own (self-only) select policy.
create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from app_admins a where a.user_id = auth.uid()
  );
$$;
comment on function public.is_app_admin is 'True if the current auth.uid() is in app_admins.';

grant execute on function public.is_app_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ai_settings (singleton)
-- ---------------------------------------------------------------------------

create table ai_settings (
  id int primary key default 1 check (id = 1),
  active_provider text not null default 'mock'
    check (active_provider in ('mock', 'anthropic', 'gemini')),
  updated_at timestamptz not null default now()
);
comment on table ai_settings is 'Single-row (id=1) global AI config. active_provider names the currently selected provider. No secrets -- readable by any authenticated user; only admins may change it.';

insert into ai_settings (id, active_provider) values (1, 'mock');

alter table ai_settings enable row level security;

-- No secrets here: any signed-in user may read which provider is active.
create policy "ai_settings_select" on ai_settings
  for select
  using (auth.uid() is not null);

-- Only platform admins may switch the active provider.
create policy "ai_settings_update" on ai_settings
  for update
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- ai_provider_keys (SECRET -- admin-only, every operation)
-- ---------------------------------------------------------------------------

create table ai_provider_keys (
  provider text primary key check (provider in ('anthropic', 'gemini')),
  api_key text not null,
  model text,
  updated_at timestamptz not null default now()
);
comment on table ai_provider_keys is 'Raw provider API keys -- the ONLY place they live. RLS restricts EVERY operation to app_admins; keys are read only in server code and never returned to the client.';

alter table ai_provider_keys enable row level security;

-- Admin-only for select/insert/update/delete. Non-admins (students,
-- authors, anon) match zero rows and cannot write.
create policy "ai_provider_keys_all" on ai_provider_keys
  for all
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- ai_artifacts (draft-gated generation store)
-- ---------------------------------------------------------------------------

create table ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid,
  chapter_id uuid references chapters(id) on delete cascade,
  block_id text,
  artifact_type text not null check (artifact_type in (
    'outline', 'student-explanation', 'instructor-summary',
    'figure-code', 'code-explanation', 'quiz'
  )),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'discarded')),
  provider text not null,
  model text,
  prompt text not null,
  source_context text,
  output jsonb not null,
  approved_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table ai_artifacts is 'Every AI generation, stored as status=draft BEFORE use (PRD §9.2 draft gate). Only an explicit approve inserts output into chapters.source. Provenance (provider/model/prompt/source_context/created_by) required on every row.';

create index ai_artifacts_chapter_status_idx on ai_artifacts (chapter_id, status);

-- Keep updated_at honest on UPDATE (reuses the trigger fn from 0002).
create trigger ai_artifacts_set_updated_at
  before update on ai_artifacts
  for each row
  execute function public.set_updated_at();

alter table ai_artifacts enable row level security;

-- Only author/admin members of the owning course may see/create/update
-- artifacts. Gated through the chapter -> course join (like content_blocks
-- in 0001) so it holds regardless of the denormalized course_id column.
-- Students and guests match zero rows. No delete policy: cleanup happens via
-- the chapters FK cascade, not ad-hoc client deletes.
create policy "ai_artifacts_select" on ai_artifacts
  for select
  using (
    exists (
      select 1 from chapters c
      where c.id = ai_artifacts.chapter_id
        and public.is_course_member(c.course_id, array['author', 'admin'])
    )
  );

create policy "ai_artifacts_insert" on ai_artifacts
  for insert
  with check (
    exists (
      select 1 from chapters c
      where c.id = ai_artifacts.chapter_id
        and public.is_course_member(c.course_id, array['author', 'admin'])
    )
  );

create policy "ai_artifacts_update" on ai_artifacts
  for update
  using (
    exists (
      select 1 from chapters c
      where c.id = ai_artifacts.chapter_id
        and public.is_course_member(c.course_id, array['author', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from chapters c
      where c.id = ai_artifacts.chapter_id
        and public.is_course_member(c.course_id, array['author', 'admin'])
    )
  );

-- ---------------------------------------------------------------------------
-- Data API exposure
--
-- Same rationale as 0002_lecture.sql: Supabase no longer auto-grants DML on
-- postgres-owned public tables to the Data API roles, so PostgREST can't
-- reach these tables without an explicit GRANT (every request would 42501).
-- RLS above is the authorization boundary; these grants only let PostgREST
-- connect. service_role bypasses RLS by design (trusted server-side path).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
