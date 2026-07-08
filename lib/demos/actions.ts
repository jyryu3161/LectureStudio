'use server';

/**
 * Marimo demo server actions (MVP4) — SERVER ONLY, elevated-role gated.
 *
 * Authoring/building a demo is restricted to elevated course members
 * (author/instructor/admin); students/anon never call these (they only ever
 * load the public iframe URL embedded in published content). Every mutation
 * re-checks the course role server-side (a server action is a public
 * endpoint; the client gate is never the only check) — defense in depth with
 * the `marimo_apps` RLS policies in supabase/migrations/0005_demos.sql.
 *
 * The actual WASM build runs out-of-process in the worker (worker/demo.ts),
 * which claims `building` rows via claim_marimo_build and uploads the bundle
 * to the public `demos` Storage bucket using the service role.
 */
import { getCourseRole, getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { CourseRole } from '@/lib/supabase/roles';

import type { DemoApp, DemoStatus } from './types';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

/** author | instructor | admin — the elevated set that may author demos. */
function isElevated(role: CourseRole | null | undefined): boolean {
  return role === 'author' || role === 'instructor' || role === 'admin';
}

interface DemoRow {
  id: string;
  course_id: string | null;
  name: string;
  source: string;
  status: string;
  bundle_path: string | null;
  log: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const KNOWN_STATUSES: readonly string[] = ['draft', 'building', 'ready', 'failed'];

function toDemoApp(row: DemoRow): DemoApp {
  return {
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    source: row.source,
    status: (KNOWN_STATUSES.includes(row.status) ? row.status : 'draft') as DemoStatus,
    bundlePath: row.bundle_path,
    log: row.log ?? '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DEMO_COLUMNS =
  'id, course_id, name, source, status, bundle_path, log, created_by, created_at, updated_at';

export interface CreateDemoAppInput {
  courseId: string;
  name: string;
  source: string;
}

/** Create a draft demo (status='draft'). Elevated members only. */
export async function createDemoApp(
  input: CreateDemoAppInput,
): Promise<ActionResult<DemoApp>> {
  try {
    const name = input.name?.trim();
    const source = input.source ?? '';
    if (!input.courseId) throw new Error('courseId is required');
    if (!name) throw new Error('name is required');
    if (!source.trim()) throw new Error('source (marimo notebook) is required');

    const user = await getCurrentUser();
    if (!user) throw new Error('not authenticated');
    const role = await getCourseRole(input.courseId);
    if (!isElevated(role)) throw new Error('forbidden: elevated course role required');

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('marimo_apps')
      .insert({
        course_id: input.courseId,
        name,
        source,
        status: 'draft',
        created_by: user.id,
      })
      .select(DEMO_COLUMNS)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'insert failed');

    return { ok: true, data: toDemoApp(data as DemoRow) };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Queue (or re-queue) a build: flips the demo to status='building' with
 * bundle_path cleared, which is what claim_marimo_build looks for. Elevated
 * members only. The worker takes it from here.
 */
export async function queueDemoBuild(id: string): Promise<ActionResult<DemoApp>> {
  try {
    if (!id) throw new Error('id is required');
    const supabase = await createClient();

    // RLS restricts this read to elevated members; a null row means either the
    // demo doesn't exist or the caller isn't allowed to see it — fail closed.
    const { data: existing } = await supabase
      .from('marimo_apps')
      .select('id, course_id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) throw new Error('demo not found');

    const role = await getCourseRole(existing.course_id ?? '');
    if (!isElevated(role)) throw new Error('forbidden: elevated course role required');

    const { data, error } = await supabase
      .from('marimo_apps')
      .update({ status: 'building', bundle_path: null, log: '' })
      .eq('id', id)
      .select(DEMO_COLUMNS)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'update failed');

    return { ok: true, data: toDemoApp(data as DemoRow) };
  } catch (error) {
    return fail(error);
  }
}

/** Read one demo. RLS restricts visibility to elevated members. */
export async function getDemoApp(id: string): Promise<ActionResult<DemoApp | null>> {
  try {
    if (!id) throw new Error('id is required');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('marimo_apps')
      .select(DEMO_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, data: data ? toDemoApp(data as DemoRow) : null };
  } catch (error) {
    return fail(error);
  }
}

/** List a course's demos (newest first). RLS restricts to elevated members. */
export async function listDemoApps(courseId: string): Promise<ActionResult<DemoApp[]>> {
  try {
    if (!courseId) throw new Error('courseId is required');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('marimo_apps')
      .select(DEMO_COLUMNS)
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return { ok: true, data: (data as DemoRow[] | null)?.map(toDemoApp) ?? [] };
  } catch (error) {
    return fail(error);
  }
}
