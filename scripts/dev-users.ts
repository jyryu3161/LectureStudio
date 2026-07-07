/**
 * DEV-ONLY user provisioning, runnable OUTSIDE a Next.js request.
 *
 * This mirrors `app/(auth)/dev-login/route.ts` exactly (same two accounts,
 * same idempotent course_members re-linking) but as a standalone script, so
 * dev accounts can be created after a `supabase db reset` WITHOUT the Next.js
 * app running. The route stays the canonical in-app path; keep the two in
 * sync if either changes.
 *
 *   author@example.com  / password   (seeded 'author' role -- acts as instructor in dev)
 *   student@example.com / password   (seeded 'student' role)
 *
 * Run (jiti already ships in node_modules; needs .env.local exported):
 *   env $(grep -v '^#' .env.local | xargs) npx jiti scripts/dev-users.ts
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS -- the trusted server-side
 * bootstrap path). Hard-refuses to run against a non-local Supabase URL.
 */
import {
  createClient as createAdminClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';

import type { CourseRole } from '../lib/supabase/roles';
import type { Database } from '../lib/supabase/types';

const SEED_COURSE_ID = '11111111-1111-1111-1111-111111111111';

const DEV_USERS: ReadonlyArray<{
  email: string;
  password: string;
  placeholderUserId: string;
  role: CourseRole;
}> = [
  {
    email: 'author@example.com',
    password: 'password',
    placeholderUserId: '00000000-0000-0000-0000-000000000001',
    role: 'author',
  },
  {
    email: 'student@example.com',
    password: 'password',
    placeholderUserId: '00000000-0000-0000-0000-000000000002',
    role: 'student',
  },
];

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'dev-users: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
        "Load .env.local first, e.g.: env $(grep -v '^#' .env.local | xargs) npx jiti scripts/dev-users.ts",
    );
  }
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error('dev-users: refusing to run against a non-local Supabase URL.');
  }

  const admin = createAdminClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // This script only makes REST/Auth-admin calls, never opens a Realtime
    // channel, but supabase-js constructs a RealtimeClient eagerly in
    // createClient(), which on Node < 22 probes for a global `WebSocket` and
    // throws when it's missing. Supplying any non-null `transport`
    // short-circuits that probe (it is never invoked). Same workaround as
    // scripts/ingest-seed.ts; the in-app dev-login route doesn't need it
    // because Next.js's runtime provides a global WebSocket.
    realtime: {
      transport: class NoopSocketNeverUsed {},
    } as unknown as SupabaseClientOptions<'public'>['realtime'],
  });

  for (const seed of DEV_USERS) {
    const userId = await ensureAuthUser(admin, seed.email, seed.password);
    await linkCourseMember(admin, SEED_COURSE_ID, seed.placeholderUserId, userId, seed.role);
    console.log(`dev-users: ${seed.email} (${seed.role}) -> ${userId}`);
  }
  console.log('dev-users: done. Sign in at /login (password: "password" for both).');
}

/** Creates the auth user if needed, or looks up its id if it already exists. */
async function ensureAuthUser(
  admin: SupabaseClient<Database>,
  email: string,
  password: string,
): Promise<string> {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!created.error) return created.data.user.id;

  const listed = await admin.auth.admin.listUsers();
  if (listed.error) throw created.error;
  const existing = listed.data.users.find((candidate) => candidate.email === email);
  if (existing) return existing.id;
  throw created.error;
}

/**
 * Points a seeded `course_members` row at a real auth uid: migrates the
 * placeholder row in place if present, else adds a fresh row. No-ops if the
 * real uid is already linked (safe to re-run).
 */
async function linkCourseMember(
  admin: SupabaseClient<Database>,
  courseId: string,
  placeholderUserId: string,
  realUserId: string,
  role: CourseRole,
): Promise<void> {
  const alreadyLinked = await admin
    .from('course_members')
    .select('user_id')
    .eq('course_id', courseId)
    .eq('user_id', realUserId)
    .maybeSingle();
  if (alreadyLinked.data) return;

  const placeholder = await admin
    .from('course_members')
    .select('user_id')
    .eq('course_id', courseId)
    .eq('user_id', placeholderUserId)
    .maybeSingle();

  if (placeholder.data) {
    const { error } = await admin
      .from('course_members')
      .update({ user_id: realUserId })
      .eq('course_id', courseId)
      .eq('user_id', placeholderUserId);
    if (error) throw error;
    return;
  }

  const { error } = await admin
    .from('course_members')
    .insert({ course_id: courseId, user_id: realUserId, role });
  if (error) throw error;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
