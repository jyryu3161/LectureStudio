'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/**
 * Server Actions backing the minimal login page (`app/(auth)/login`).
 * Intentionally simple: no client-side form state, errors are surfaced by
 * redirecting back to /login with an `error` query param.
 */

/** Signs in with email/password. Redirects to `redirectTo` on success. */
export async function signInWithPassword(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const redirectTo = sanitizeRedirect(formData.get('redirectTo'));

  if (!email || !password) {
    redirect(loginErrorUrl('Email and password are required.', redirectTo));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(loginErrorUrl(error.message, redirectTo));
  }

  redirect(redirectTo);
}

/** Signs the current user out and returns them to the login page. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

function loginErrorUrl(message: string, redirectTo: string): string {
  const params = new URLSearchParams({ error: message, next: redirectTo });
  return `/login?${params.toString()}`;
}

/** Only ever redirect to a same-origin relative path -- no open redirects. */
function sanitizeRedirect(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : '';
  return path.startsWith('/') && !path.startsWith('//') ? path : '/reading';
}
