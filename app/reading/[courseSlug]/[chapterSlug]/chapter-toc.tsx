import Link from 'next/link';

import { cn } from '@/lib/utils';

export interface TocChapter {
  id: string;
  slug: string;
  title: string;
  order_index: number;
}

/**
 * Left-rail course table of contents (design.zip reading mockup's
 * "CONTENTS" list): every chapter in the current course, with the chapter
 * being read highlighted. Plain server-rendered `next/link`s -- no client
 * JS needed for navigation or keyboard support (a real `<a>` is Tab/Enter
 * operable natively).
 */
export function ChapterToc({
  courseId,
  chapters,
  currentChapterId,
}: {
  courseId: string;
  chapters: TocChapter[];
  currentChapterId: string;
}) {
  if (chapters.length === 0) {
    return <p className="text-sm text-muted">No chapters published yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-0.5">
      {chapters.map((chapter) => {
        const isActive = chapter.id === currentChapterId;
        return (
          <li key={chapter.id}>
            <Link
              href={`/reading/${courseId}/${chapter.slug}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-baseline gap-2.5 rounded-lg px-3 py-2 text-sm leading-snug transition-colors',
                isActive ? 'bg-ink text-white' : 'text-ink/80 hover:bg-black/5',
              )}
            >
              <span
                className={cn(
                  'font-mono text-[11px] tabular-nums',
                  isActive ? 'text-white/60' : 'text-muted',
                )}
              >
                {String(chapter.order_index).padStart(2, '0')}
              </span>
              <span>{chapter.title}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
