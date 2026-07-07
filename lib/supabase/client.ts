import { createBrowserClient } from '@supabase/ssr';

import type { Database } from './types';

/**
 * Supabase client for use in Client Components. Safe to call per-render —
 * @supabase/ssr memoizes a singleton browser client internally.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
