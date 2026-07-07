/**
 * Reading Mode top bar (design.zip reading mockup): course code + title on
 * the left, a KO/EN language toggle on the right. The language toggle is a
 * static placeholder only -- there is no i18n content pipeline yet, so it
 * must not claim EN actually works. Pure presentational server component
 * (no state, no client JS needed).
 */
export function ReadingTopBar({
  courseCode,
  courseTitle,
}: {
  courseCode: string | null;
  courseTitle: string;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-paper/70 px-5 py-3.5 backdrop-blur-sm lg:px-7">
      <div className="flex min-w-0 items-baseline gap-2">
        {courseCode ? (
          <span className="font-mono text-[13px] font-semibold tracking-tight text-ink">
            {courseCode}
          </span>
        ) : null}
        {courseCode ? (
          <span className="text-muted" aria-hidden="true">
            /
          </span>
        ) : null}
        <span className="truncate text-[13px] text-muted-foreground">{courseTitle}</span>
      </div>

      <div
        role="group"
        aria-label="Reading language"
        aria-disabled="true"
        title="Language switching isn't available yet"
        className="flex shrink-0 items-center gap-0.5 rounded-full border border-border-subtle bg-white p-0.5 font-mono text-[11px] uppercase tracking-wide text-muted"
      >
        <span className="rounded-full bg-ink px-2.5 py-1 text-white">한국어</span>
        <span className="cursor-not-allowed px-2.5 py-1">EN</span>
      </div>
    </header>
  );
}
