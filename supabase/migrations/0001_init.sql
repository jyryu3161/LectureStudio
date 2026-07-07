-- 0001_init.sql
-- Lecture Studio MVP0 schema: Course -> Chapter -> Block canonical hierarchy,
-- plus course membership/roles and asset storage metadata.
--
-- Security invariant (PRD Sec 5.6 / 15.3): `content_blocks` rows with
-- visibility = 'instructor' must never be readable by students or guests.
-- This is enforced below at the RLS layer (not just in application code),
-- so it holds even if a route handler has a bug.
--
-- Bootstrap note: course creation and granting the first 'admin'/'author'
-- membership on a brand-new course are both gated on already being a
-- member of that course (as specified), which is intentionally impossible
-- for a course that doesn't exist yet. For MVP0 there is no self-serve
-- "create course" UI (see docs/01-plan) -- new courses are provisioned via
-- a trusted server-side path (service_role key, or supabase/seed.sql),
-- which bypasses RLS, and must insert the initial course_members admin
-- row in the same transaction as the course itself.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  description text,
  owner_id uuid,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table courses is 'Course = one lecture / ebook. Top of the Course -> Chapter -> Block hierarchy.';

create table course_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);
comment on table course_versions is 'Release snapshots of a course; courses.current_version_id points at one of these.';

create table course_members (
  course_id uuid references courses(id) on delete cascade,
  user_id uuid,
  role text not null check (role in ('admin', 'author', 'instructor', 'student')),
  primary key (course_id, user_id)
);
comment on table course_members is 'Per-course role assignment. user_id intentionally has no FK to auth.users yet -- see supabase/seed.sql note.';

create table chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  version_id uuid,
  title text not null,
  slug text not null,
  order_index int not null default 0,
  source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table chapters is 'One chapter of a course. source is the canonical MyST/Markdown text the Content Engine parses into content_blocks.';

create table content_blocks (
  id text primary key,
  course_id uuid,
  chapter_id uuid references chapters(id) on delete cascade,
  version_id uuid,
  block_type text not null,
  order_index int not null default 0,
  content_hash text,
  visibility text not null default 'public' check (visibility in ('public', 'instructor')),
  source_range jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table content_blocks is 'Parsed block index (id = ''blk_'' || nanoid). One row per top-level MyST node. Populated by the Content Engine, not hand-authored.';
comment on column content_blocks.visibility is 'instructor-note blocks use visibility=''instructor'' and must be filtered server-side / by RLS -- never expose them to students or guests.';

create table assets (
  id uuid primary key default gen_random_uuid(),
  course_id uuid,
  kind text,
  storage_path text,
  alt_text text,
  caption text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table assets is 'Images/figures/etc. stored in Supabase Storage; storage_path is the bucket-relative key.';

-- Foreign-key columns are not auto-indexed by Postgres, and every RLS
-- policy below joins through these, so index them up front.
create index chapters_course_id_idx on chapters (course_id);
create index content_blocks_chapter_id_idx on content_blocks (chapter_id);
create index content_blocks_course_id_idx on content_blocks (course_id);
create index course_versions_course_id_idx on course_versions (course_id);
create index assets_course_id_idx on assets (course_id);

-- ---------------------------------------------------------------------------
-- Helper functions
--
-- SECURITY DEFINER so membership checks read course_members/courses with
-- the function owner's privileges instead of the caller's -- this sidesteps
-- RLS recursion/performance pitfalls when a table's own policy needs to
-- consult course_members. This is Supabase's documented pattern:
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- ---------------------------------------------------------------------------

create or replace function public.is_course_member(p_course_id uuid, p_roles text[] default null)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from course_members m
    where m.course_id = p_course_id
      and m.user_id = auth.uid()
      and (p_roles is null or m.role = any(p_roles))
  );
$$;
comment on function public.is_course_member is 'True if the current auth.uid() belongs to p_course_id, optionally restricted to p_roles.';

create or replace function public.is_course_readable(p_course_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from courses c
    where c.id = p_course_id
      and (c.visibility = 'public' or public.is_course_member(c.id))
  );
$$;
comment on function public.is_course_readable is 'True if p_course_id is public, or the current user is a member (any role).';

grant execute on function public.is_course_member(uuid, text[]) to anon, authenticated;
grant execute on function public.is_course_readable(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table courses enable row level security;
alter table course_versions enable row level security;
alter table course_members enable row level security;
alter table chapters enable row level security;
alter table content_blocks enable row level security;
alter table assets enable row level security;

-- courses: readable if public, or the requester is a member (any role).
create policy "courses_select" on courses
  for select
  using (visibility = 'public' or public.is_course_member(id));

-- courses: only author/admin members may create/edit/delete. See the
-- bootstrap note at the top of this file for how the first course/admin
-- pair gets created.
create policy "courses_write" on courses
  for all
  using (public.is_course_member(id, array['author', 'admin']))
  with check (public.is_course_member(id, array['author', 'admin']));

-- course_versions: same visibility as their parent course.
create policy "course_versions_select" on course_versions
  for select
  using (public.is_course_readable(course_id));

create policy "course_versions_write" on course_versions
  for all
  using (public.is_course_member(course_id, array['author', 'admin']))
  with check (public.is_course_member(course_id, array['author', 'admin']));

-- course_members: a user can always see their own membership rows; course
-- admins can see (and manage) the full roster for their course.
create policy "course_members_select" on course_members
  for select
  using (user_id = auth.uid() or public.is_course_member(course_id, array['admin']));

create policy "course_members_write" on course_members
  for all
  using (public.is_course_member(course_id, array['admin']))
  with check (public.is_course_member(course_id, array['admin']));

-- chapters: same visibility as their parent course.
create policy "chapters_select" on chapters
  for select
  using (public.is_course_readable(course_id));

create policy "chapters_write" on chapters
  for all
  using (public.is_course_member(course_id, array['author', 'admin']))
  with check (public.is_course_member(course_id, array['author', 'admin']));

-- content_blocks: readable if the parent course is readable, AND --
-- critically -- instructor-only blocks additionally require an
-- author/instructor/admin membership. This is the enforcement point for
-- the instructor-note security invariant (PRD Sec 5.6 / 15.3): students
-- and guests must never receive these rows, in the DOM or the API.
create policy "content_blocks_select" on content_blocks
  for select
  using (
    exists (
      select 1 from chapters c
      where c.id = content_blocks.chapter_id
        and public.is_course_readable(c.course_id)
    )
    and (
      content_blocks.visibility <> 'instructor'
      or exists (
        select 1 from chapters c
        where c.id = content_blocks.chapter_id
          and public.is_course_member(c.course_id, array['author', 'instructor', 'admin'])
      )
    )
  );

create policy "content_blocks_write" on content_blocks
  for all
  using (
    exists (
      select 1 from chapters c
      where c.id = content_blocks.chapter_id
        and public.is_course_member(c.course_id, array['author', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from chapters c
      where c.id = content_blocks.chapter_id
        and public.is_course_member(c.course_id, array['author', 'admin'])
    )
  );

-- assets: same visibility as their parent course. (No instructor-only
-- concept for assets in MVP0 -- anything linked from a readable chapter
-- is fair game.)
create policy "assets_select" on assets
  for select
  using (public.is_course_readable(course_id));

create policy "assets_write" on assets
  for all
  using (public.is_course_member(course_id, array['author', 'admin']))
  with check (public.is_course_member(course_id, array['author', 'admin']));
