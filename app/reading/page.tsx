import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/**
 * Reading Mode entry point. MVP0 has no "pick a course" UI yet -- this finds
 * the first course + chapter the current viewer (or RLS, for a guest) can
 * actually read and redirects straight to its permalink
 * (`/reading/[courseId]/[chapterSlug]`). Uses the request-scoped server
 * client, so a private/unpublished course is simply invisible here rather
 * than requiring separate gating logic.
 */
export default async function ReadingIndexPage() {
  const supabase = await createClient();

  const { data: course } = await supabase
    .from('courses')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (course) {
    const { data: chapter } = await supabase
      .from('chapters')
      .select('slug')
      .eq('course_id', course.id)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (chapter) {
      redirect(`/reading/${course.id}/${chapter.slug}`);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-12 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Reading Mode</p>
        <h1 className="mt-2 font-serif text-2xl text-ink">Nothing to read yet</h1>
        <p className="mt-2 text-sm text-muted">
          There&rsquo;s no published chapter available for your account yet. Sign in with a course
          account, or ask an author to publish one.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-ink px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
