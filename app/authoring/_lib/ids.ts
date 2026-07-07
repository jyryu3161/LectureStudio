/**
 * MVP0's `courses` table has no separate human-readable slug column (only
 * `chapters.slug` does -- see supabase/migrations/0001_init.sql). So the
 * `[courseSlug]` route segment used throughout `app/authoring/**` is the
 * course's own `id` (a Postgres `uuid`), not a distinct slug. This guards
 * route params before they reach a Supabase `uuid` column filter: a
 * non-uuid string handed to `.eq('id', value)` on a `uuid` column surfaces
 * as a raw Postgres/PostgREST error rather than a clean 404.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
