import Link from 'next/link';

/**
 * Branded 404 for the `app/authoring/**` subtree (e.g. an unknown course id
 * or chapter slug in `/authoring/[courseSlug]/[chapterSlug]`, or a private
 * course the current user isn't a member of at all -- see that page's RLS
 * note). Scoped to this route group rather than a root-level not-found so
 * it doesn't reach outside this workstream's owned paths.
 */
export default function AuthoringNotFound() {
  return (
    <div className="flex h-full items-center justify-center p-12 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Authoring Studio</p>
        <h1 className="mt-2 font-serif text-2xl text-ink">Course or chapter not found</h1>
        <p className="mt-2 text-sm text-muted">
          It may not exist, or you may not have access to it yet.
        </p>
        <Link
          href="/authoring"
          className="mt-6 inline-block rounded-xl border border-border bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          Back to Authoring Studio
        </Link>
      </div>
    </div>
  );
}
