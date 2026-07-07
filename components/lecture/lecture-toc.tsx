'use client';

import Link from 'next/link';
import { PanelLeftClose } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface LectureTocChapterItem {
  id: string;
  title: string;
  slug: string;
  order_index: number;
}

export interface LectureTocProps {
  courseId: string;
  chapters: LectureTocChapterItem[];
  currentChapterId: string;
  onCollapse: () => void;
}

/**
 * Collapsible chapter list for Lecture Mode. Navigating picks a different
 * chapter to present (`/lecture/[courseId]/[slug]`). Kept visually quiet so
 * the presented body stays the focus.
 */
export function LectureToc({ courseId, chapters, currentChapterId, onCollapse }: LectureTocProps) {
  return (
    <nav
      aria-label="챕터 목록"
      className="flex h-full w-60 flex-col border-r border-border-subtle bg-canvas"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-mono text-xs uppercase tracking-wide text-muted">챕터</span>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="목차 닫기"
          title="목차 닫기"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-black/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <PanelLeftClose size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
      <ol className="flex-1 overflow-y-auto px-2 pb-4">
        {chapters.map((ch) => {
          const isCurrent = ch.id === currentChapterId;
          return (
            <li key={ch.id}>
              <Link
                href={`/lecture/${courseId}/${ch.slug}`}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'flex items-baseline gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  isCurrent
                    ? 'bg-white font-medium text-ink shadow-sm'
                    : 'text-muted-foreground hover:bg-black/5 hover:text-ink',
                )}
              >
                <span className="font-mono text-[11px] text-muted">
                  {String(ch.order_index).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">{ch.title}</span>
              </Link>
            </li>
          );
        })}
        {chapters.length === 0 && (
          <li className="px-2.5 py-2 text-sm text-muted">챕터가 없습니다.</li>
        )}
      </ol>
    </nav>
  );
}
