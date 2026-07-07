import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from './types';

/**
 * Supabase client for use in Server Components, Route Handlers, and Server
 * Actions. Create a fresh client per request — never cache/reuse across
 * requests — per @supabase/ssr guidance.
 *
 * `next/headers`'s `cookies()` is async in Next.js 15, so this factory is
 * async too: `const supabase = await createClient()`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component render, which
            // cannot mutate cookies. Safe to ignore as long as middleware
            // refreshes the session (wired up by the Auth workstream).
          }
        },
      },
    },
  );
}
