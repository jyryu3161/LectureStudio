import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from '@/lib/supabase/types';

/**
 * Refreshes the Supabase auth session on every matched request.
 *
 * Server Components can't write cookies, so if an access token expires
 * mid-session nothing would ever refresh it without this: middleware runs
 * before the Server Component tree, calls `getUser()` (which transparently
 * refreshes an expired token via the refresh token) and writes the
 * refreshed cookies onto both the outgoing request (so this same pass sees
 * them) and the response (so the browser stores them).
 *
 * This does NOT gate routes -- courses/chapters can be publicly readable
 * (see `courses.visibility = 'public'` + RLS), so login is opt-in, not
 * enforced globally here. Route/role gating happens where content is
 * fetched, via `lib/auth/session.ts` + `lib/auth/guards.ts`.
 *
 * Pattern per @supabase/ssr's documented Next.js middleware guidance:
 * https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not add code between `createServerClient` and this call: touching
  // the session here (not just reading cookies) is what actually refreshes
  // an expired access token, and Supabase's docs call out that anything in
  // between risks subtle bugs where users get randomly signed out.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on everything except static assets / Next internals, which never
  // need a session and would just add cookie-refresh overhead.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
