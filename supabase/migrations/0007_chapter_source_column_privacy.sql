-- ---------------------------------------------------------------------------
-- 0007_chapter_source_column_privacy — hide chapters.source from the REST API.
--
-- PRD §5.6 / §15.3: `instructor-note` prose must never reach a student. The
-- DOM, render, and export layers all strip notes correctly, but the raw
-- `chapters.source` column (the canonical MyST text, which CONTAINS the notes)
-- was still SELECTable over PostgREST by any readable course member — a
-- student's JWT could `GET /rest/v1/chapters?select=source` and read the notes
-- directly. RLS is row-level and cannot hide a single column, so we use
-- column-level privileges: revoke table-wide SELECT from the API roles and
-- re-grant SELECT on every column EXCEPT `source`.
--
-- Reads that legitimately need the full source (server-side parse → role-filter
-- → render/export) now go through a trusted service-role client in
-- lib/chapters/source.ts, gated by the caller's existing RLS/role check. The
-- browser never reads `chapters` directly, so nothing client-side regresses.
--
-- INSERT/UPDATE on `source` are intentionally LEFT INTACT: authoring/AI writes
-- still go through the request-scoped client and remain governed by the
-- `chapters_write` RLS policy (author/admin only), so a student cannot write
-- source either. Only the SELECT leak is closed here.
-- ---------------------------------------------------------------------------

-- Drop the table-wide SELECT (which implicitly covers every column, incl. source)...
revoke select on table chapters from anon, authenticated;

-- ...and re-grant SELECT on all columns EXCEPT source. RLS (chapters_select)
-- still governs WHICH rows these roles may read; this only narrows the columns.
grant select (id, course_id, version_id, title, slug, order_index, created_at, updated_at)
  on table chapters to anon, authenticated;
