import Link from 'next/link';

/**
 * Branded 404 for anything under /reading (a bad course/chapter segment, or
 * a course/chapter RLS hides from the current viewer). The copy is
 * deliberately non-committal about *why* -- "doesn't exist" and "you can't
 * see it" must look identical to an unauthorized viewer, or the 404 itself
 * becomes a side channel for confirming a private course exists.
 */
export default function ReadingNotFound() {
  return (
    <div className="flex h-full items-center justify-center p-12 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Reading Mode</p>
        <h1 className="mt-2 font-serif text-2xl text-ink">Chapter not found</h1>
        <p className="mt-2 text-sm text-muted">
          This chapter doesn&rsquo;t exist, or you don&rsquo;t have access to it.
        </p>
        <Link
          href="/reading"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-ink px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Back to Reading Mode
        </Link>
      </div>
    </div>
  );
}
