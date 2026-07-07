import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/**
 * Lecture Mode entry point. Like Reading Mode's index, there's no "pick a
 * course" UI yet -- find the first course + chapter the current viewer can
 * read and redirect to its lecture permalink (`/lecture/[courseId]/[slug]`).
 * The role gate (only author/instructor/admin may present) is enforced on the
 * chapter page itself, which redirects a student back to Reading Mode.
 */
export default async function LectureIndexPage() {
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
      redirect(`/lecture/${course.id}/${chapter.slug}`);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-12 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Lecture Mode</p>
        <h1 className="mt-2 font-serif text-2xl text-ink">Nothing to present yet</h1>
        <p className="mt-2 text-sm text-muted">
          There&rsquo;s no chapter available to present for your account yet. Sign in with a course
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
