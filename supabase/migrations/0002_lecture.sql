-- 0002_lecture.sql
-- Lecture Mode (MVP1): live lecture sessions and per-block annotations.
--
-- Two tables layered on top of the Course -> Chapter -> Block hierarchy from
-- 0001_init.sql:
--   - lecture_sessions: one live/archived lecture over a chapter. An
--     instructor (author, in dev -- see note below) starts a session, draws
--     annotations against blocks during it, then optionally `published`s it
--     so students can replay the annotated chapter.
--   - annotations: pen/highlighter strokes and text notes anchored to a
--     single content block, in the SHARED ANNOTATION CONTRACT coordinate
--     space (per-block, normalized 0..1 -- PRD §8.6/8.7). Never stores
--     scroll/viewport/absolute pixels.
--
-- ROLE NOTE (dev): the seed course has no 'instructor' member -- the 'author'
-- acts as instructor (PRD allows Author ⊇ teaching in dev). Every write
-- policy below therefore accepts array['author','instructor','admin'] as the
-- "elevated / may teach" set, so an author can run and publish sessions.
--
-- SECURITY invariant: students/guests must never read an *unpublished*
-- session or its annotations. Enforced at the RLS layer here (not just in
-- the server API) so it holds even if a route handler has a bug -- the same
-- defense-in-depth stance as content_blocks' instructor-note protection.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table lecture_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  published boolean not null default false,
  created_by uuid,
  started_at timestamptz default now(),
  ended_at timestamptz,
  created_at timestamptz default now()
);
comment on table lecture_sessions is 'One lecture delivered over a chapter. published=true makes it (and its annotations) replayable by students/guests.';

create table annotations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  -- Deliberately a plain text column, NOT an FK to content_blocks(id):
  -- content_blocks rows are re-upserted (and stale ones deleted) every time
  -- a chapter is re-ingested (see lib/content/db.ts upsertBlockIndex), which
  -- would break/cascade an FK. Annotations survive re-ingest by anchoring to
  -- the stable block id string + created_against_hash instead.
  block_id text not null,
  course_version_id uuid references course_versions(id) on delete set null,
  lecture_session_id uuid not null references lecture_sessions(id) on delete cascade,
  author_id uuid,
  annotation_type text not null check (annotation_type in ('pen', 'highlighter', 'text')),
  coord_space text not null default 'block_normalized' check (coord_space = 'block_normalized'),
  -- The content_hash the block had when this was drawn (PRD §8.7): lets the
  -- UI flag/repair an annotation whose underlying block later changed.
  created_against_hash text,
  -- pen/highlighter: { points: [{x,y},...] } (normalized 0..1).
  -- text:            { text: string, position: {x,y} }.
  -- A multi-block stroke is SPLIT into per-block rows sharing data.group_id
  -- so the eraser can delete a whole stroke at once.
  data jsonb not null default '{}'::jsonb,
  -- { color, width } (+ opacity for highlighter). Colors are constrained to
  -- the toolbar palette in the server API (lib/annotations/db.ts), not here,
  -- to keep the palette in one place (TypeScript) rather than duplicated.
  style jsonb not null default '{}'::jsonb,
  scope text not null default 'session',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table annotations is 'Per-block, block-normalized (0..1) pen/highlighter/text annotations drawn during a lecture_session. See SHARED ANNOTATION CONTRACT (PRD §8.6/8.7).';

-- FK columns aren't auto-indexed, and every RLS policy / list query below
-- joins or filters through these.
create index lecture_sessions_course_id_idx on lecture_sessions (course_id);
create index lecture_sessions_chapter_id_idx on lecture_sessions (chapter_id);
create index annotations_lecture_session_id_idx on annotations (lecture_session_id);
create index annotations_chapter_block_idx on annotations (chapter_id, block_id);
create index annotations_course_id_idx on annotations (course_id);

-- Keep updated_at honest on every UPDATE without the app having to remember.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger annotations_set_updated_at
  before update on annotations
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Reuses the SECURITY DEFINER membership helpers from 0001_init.sql
-- (is_course_member / is_course_readable) so these policies don't recurse
-- through course_members' own RLS.
-- ---------------------------------------------------------------------------

alter table lecture_sessions enable row level security;
alter table annotations enable row level security;

-- lecture_sessions: elevated members (author/instructor/admin) see every
-- session for their course; everyone else (student members, and guests on a
-- public course) sees a session only once it is published. is_course_readable
-- gates guests to public courses; a private-course student is a member so it
-- passes for them too.
create policy "lecture_sessions_select" on lecture_sessions
  for select
  using (
    public.is_course_member(course_id, array['author', 'instructor', 'admin'])
    or (published = true and public.is_course_readable(course_id))
  );

-- Only elevated members may create/update/end/publish sessions.
create policy "lecture_sessions_write" on lecture_sessions
  for all
  using (public.is_course_member(course_id, array['author', 'instructor', 'admin']))
  with check (public.is_course_member(course_id, array['author', 'instructor', 'admin']));

-- annotations: elevated members see all annotations for their course;
-- everyone else sees an annotation only when its parent session is published
-- (and the course is readable to them at all).
create policy "annotations_select" on annotations
  for select
  using (
    public.is_course_member(course_id, array['author', 'instructor', 'admin'])
    or (
      public.is_course_readable(course_id)
      and exists (
        select 1 from lecture_sessions s
        where s.id = annotations.lecture_session_id
          and s.published = true
      )
    )
  );

-- Only elevated members may write annotations. (Students never annotate in
-- MVP1 -- Lecture Mode strokes are the instructor's.)
create policy "annotations_write" on annotations
  for all
  using (public.is_course_member(course_id, array['author', 'instructor', 'admin']))
  with check (public.is_course_member(course_id, array['author', 'instructor', 'admin']));

-- ---------------------------------------------------------------------------
-- Data API exposure
--
-- Supabase's newer default no longer auto-grants DML on `postgres`-owned
-- `public` tables to the Data API roles (anon/authenticated/service_role) --
-- see the `auto_expose_new_tables` note in supabase/config.toml (that legacy
-- flag is deprecated and removed 2026-10-30). Without an explicit GRANT,
-- PostgREST can't reach ANY of these tables and every request 42501s
-- ("permission denied"), including the authenticated app and the
-- service-role ingest script.
--
-- So grant table/sequence privileges to the API roles explicitly, and set
-- default privileges so future `postgres`-created tables are reachable too.
-- This is applied here (rather than in 0001) only because 0001's file is not
-- editable in this workstream; it deliberately covers ALL public tables,
-- including 0001's. This is NOT the authorization boundary -- every table has
-- RLS enabled and the policies above/in 0001 are what actually restrict rows.
-- These grants only let PostgREST connect to the tables at all; RLS still
-- decides what each role can see or change (and service_role bypasses RLS by
-- design, as the trusted server-side/ingest path).
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
