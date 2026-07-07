import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { signInWithPassword, signOut } from '@/lib/auth/actions';
import { getCurrentUser } from '@/lib/auth/session';

/**
 * Minimal Supabase Auth email/password login. Owned by the Auth
 * workstream -- deliberately plain (no client JS, works with forms + the
 * `signInWithPassword` / `signOut` Server Actions in `lib/auth/actions.ts`).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const redirectTo = params.next?.startsWith('/') ? params.next : '/reading';

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-paper p-8 shadow-soft">
        <Link href="/" className="mb-8 flex items-center gap-2.5 text-base font-semibold tracking-tight text-ink">
          <span className="h-5 w-5 rotate-45 rounded-[3px] bg-ink" aria-hidden="true" />
          Lecture Studio
        </Link>

        {user ? (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="font-serif text-2xl text-ink">You&rsquo;re signed in</h1>
              <p className="mt-1 text-sm text-muted">
                as <span className="font-medium text-ink">{user.email}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="accent">
                <Link href="/reading">Go to Reading Mode</Link>
              </Button>
              <form action={signOut}>
                <Button type="submit" variant="outline">
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-serif text-2xl text-ink">Sign in</h1>
              <p className="mt-1 text-sm text-muted">Use your course account to continue.</p>
            </div>

            {params.error ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {params.error}
              </p>
            ) : null}

            <form action={signInWithPassword} className="flex flex-col gap-4">
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                Email
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="author@example.com"
                  className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                Password
                <input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
              <Button type="submit" variant="accent" size="lg" className="mt-2">
                Sign in
              </Button>
            </form>

            <p className="text-center font-mono text-xs uppercase tracking-wide text-muted">
              dev seed accounts &middot; password &ldquo;password&rdquo;
            </p>
            <p className="text-center text-xs text-muted">
              author@example.com &middot; student@example.com
              <br />
              Not created yet? Visit{' '}
              <Link href="/dev-login" className="underline underline-offset-2 hover:text-ink">
                /dev-login
              </Link>{' '}
              once (local dev only).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
