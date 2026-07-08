/**
 * SERVER-ONLY. Elevated (service-role) read of the raw `chapters.source` text.
 *
 * WHY THIS EXISTS (PRD §5.6 / §15.3): the canonical MyST source carries
 * `instructor-note` prose. It must never reach a student — not through the
 * rendered DOM, not through exports, and NOT through the PostgREST surface. The
 * DOM/render/export layers already strip notes, but the raw `source` column was
 * still SELECTable over REST by any readable course member (a student's JWT
 * could `GET /rest/v1/chapters?select=source`). Migration 0007 revokes the
 * `source` column from `anon`/`authenticated` to close that leak, so no
 * request-scoped (RLS) client can read `source` anymore.
 *
 * Server code that legitimately needs the full source (parse → role-filter →
 * render/export) therefore reads it here via a trusted service-role client
 * (bypasses RLS), exactly like lib/demos/embed.ts and lib/ai/settings.ts.
 *
 * SECURITY CONTRACT: this helper performs NO authorization of its own. Every
 * caller MUST have already authorized the viewer against the chapter/course
 * (via the request-scoped RLS client and/or a course-role gate) BEFORE calling
 * it, and the returned text — which still contains instructor-only prose — MUST
 * be role-filtered server-side and MUST NOT cross the RSC boundary unfiltered.
 */
import 'server-only';

import { createClient as createServiceClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('chapters: missing Supabase service-role configuration on the server.');
  }
  return createServiceClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Returns `{ source }` for an already-authorized chapter id, or `null` if the id
 * is malformed or the row does not exist (so callers can distinguish "no row"
 * from an empty source). Callers own the authorization decision (see the
 * SECURITY CONTRACT above).
 *
 * NOTE on `next dev`: React serializes awaited Server Component I/O into the RSC
 * flight DEBUG payload in development, so the raw source (instructor notes
 * included) can appear in view-source there — a dev-only artifact that is
 * stripped from production builds, and independent of this helper (any awaited
 * read of the source column does the same). It is NOT a substitute enforcement
 * point: the authoritative fix for the instructor-note leak is (a) the REST
 * column revoke in migration 0007 and (b) role-filtering the rendered output so
 * only student-visible blocks ever cross the RSC boundary. This helper's result
 * must therefore stay server-side and never be returned unfiltered.
 */
export async function readChapterSource(chapterId: string): Promise<{ source: string } | null> {
  const id = chapterId.trim();
  if (!UUID_RE.test(id)) return null;

  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('chapters')
    .select('source')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return { source: data.source ?? '' };
}
