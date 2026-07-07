import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-full bg-paper">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-paper/80 px-8 py-5 backdrop-blur">
        <div className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-ink">
          <span className="h-5 w-5 rotate-45 rounded-[3px] bg-ink" aria-hidden="true" />
          Lecture Studio
        </div>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/reading"
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Open demo
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-8 py-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-white px-3.5 py-1.5 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          One Source · Multiple Modes
        </div>

        <h1 className="text-balance mb-6 max-w-2xl font-serif text-6xl font-medium leading-[1.04] tracking-tight text-ink">
          Write an ebook. It becomes your lecture.
        </h1>

        <p className="mb-10 max-w-xl text-lg leading-relaxed text-muted">
          One source powers student reading, live in-class annotation, review material, and a
          per-course execution environment — with an AI copilot that helps you author the next
          version.
        </p>

        <div className="flex flex-wrap items-center gap-3.5">
          <Link
            href="/reading"
            className="rounded-xl bg-ink px-6 py-3.5 text-[15.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Read the ebook →
          </Link>
          <Link
            href="/authoring"
            className="rounded-xl border border-border bg-white px-6 py-3.5 text-[15.5px] font-medium text-ink transition-colors hover:bg-paper"
          >
            Try Authoring Studio
          </Link>
        </div>
      </section>
    </div>
  );
}
