import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import type { CourseRole } from '@/lib/supabase/roles';
import type { Database } from '@/lib/supabase/types';

/**
 * DEV-ONLY provisioning route. Not part of the product surface.
 *
 * `supabase/seed.sql` seeds two `course_members` rows against fixed
 * placeholder UUIDs (see the note at the top of that file) because there
 * are no real `auth.users` accounts to point at during a fresh
 * `supabase db reset` -- `course_members.user_id` intentionally has no FK
 * to `auth.users` for exactly this reason.
 *
 * Visiting this route (GET, once) creates two real Supabase Auth users --
 *   - author@example.com  / password  (seeded 'author' role)
 *   - student@example.com / password  (seeded 'student' role)
 * -- via the Auth Admin API (service role key, bypasses RLS) and re-points
 * (or adds) the corresponding `course_members` row at each new real uid, so
 * both can then sign in normally at /login.
 *
 * Safe to call more than once (idempotent) and hard-disabled unless running
 * against a local Supabase stack in a non-production build.
 */

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

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production builds.' }, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          'Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) in .env.local -- see .env.example.',
      },
      { status: 500 },
    );
  }

  // Extra guardrail on top of the NODE_ENV check: this uses the service
  // role key to bypass RLS, so refuse to run it against anything that
  // isn't the local Supabase stack, even if somehow invoked outside dev.
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    return NextResponse.json(
      { error: 'Refusing to run dev-login against a non-local Supabase URL.' },
      { status: 403 },
    );
  }

  const admin = createAdminClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const users = [];
    for (const seed of DEV_USERS) {
      const userId = await ensureAuthUser(admin, seed.email, seed.password);
      await linkCourseMember(admin, SEED_COURSE_ID, seed.placeholderUserId, userId, seed.role);
      users.push({ email: seed.email, role: seed.role, userId });
    }

    return NextResponse.json({
      ok: true,
      message: 'Dev accounts ready. Sign in at /login (password: "password" for both).',
      loginUrl: '/login',
      users,
    });
  } catch (error) {
    // Dev-only route: log full detail server-side for whoever is running
    // it locally, but never leak more than a message to the response.
    console.error('[dev-login] provisioning failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Dev login provisioning failed.' },
      { status: 500 },
    );
  }
}

/** Creates the auth user if needed, or looks up its id if it already exists. */
async function ensureAuthUser(
  admin: SupabaseClient<Database>,
  email: string,
  password: string,
): Promise<string> {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!created.error) {
    return created.data.user.id;
  }

  const listed = await admin.auth.admin.listUsers();
  if (listed.error) {
    throw created.error;
  }

  const existing = listed.data.users.find((candidate) => candidate.email === email);
  if (existing) {
    return existing.id;
  }

  throw created.error;
}

/**
 * Points a seeded `course_members` row at a real auth uid: migrates the
 * placeholder row in place if it's still there, otherwise adds a fresh row.
 * No-ops if `realUserId` is already linked (safe to re-run).
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
