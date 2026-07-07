import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/**
 * Authoring Studio entry point. MVP0 has no course-picker UI yet -- there's
 * also no self-serve "create course" flow at all (see the bootstrap note
 * atop supabase/migrations/0001_init.sql) -- so this simply finds the
 * first course the signed-in user can author and its first chapter, then
 * hands off to the real editor at `/authoring/[courseSlug]/[chapterSlug]`.
 */
export default async function AuthoringIndexPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/authoring');
  }

  const supabase = await createClient();
  const { data: memberships, error: membershipError } = await supabase
    .from('course_members')
    .select('course_id')
    .eq('user_id', user.id)
    .in('role', ['author', 'admin']);

  if (membershipError) {
    throw new Error(`Failed to load your courses: ${membershipError.message}`);
  }

  const courseId = memberships?.[0]?.course_id;
  if (!courseId) {
    return (
      <EmptyState message="You don't have author access on any course yet. Ask a course admin to grant you the author role." />
    );
  }

  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('slug')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (chapterError) {
    throw new Error(`Failed to load chapters: ${chapterError.message}`);
  }
  if (!chapter) {
    return <EmptyState message="This course doesn't have any chapters yet." />;
  }

  redirect(`/authoring/${courseId}/${chapter.slug}`);
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-12 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Authoring Studio</p>
        <h1 className="mt-2 font-serif text-2xl text-ink">Nothing to author yet</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <Link
          href="/reading"
          className="mt-6 inline-block rounded-xl border border-border bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          Go to Reading Mode
        </Link>
      </div>
    </div>
  );
}
