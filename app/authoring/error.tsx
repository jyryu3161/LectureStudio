'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Error boundary for the `app/authoring/**` subtree (Next.js requires this
 * to be a Client Component). Catches unexpected failures -- e.g. a Supabase
 * query error surfaced by throwing in page.tsx -- with an explicit message
 * and a retry, instead of a silent blank page.
 */
export default function AuthoringError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[authoring] unexpected error:', error);
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center p-12 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Authoring Studio</p>
        <h1 className="mt-2 font-serif text-2xl text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">{error.message || 'An unexpected error occurred.'}</p>
        <Button type="button" variant="accent" className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
