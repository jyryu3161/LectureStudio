'use client';

import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { useAnnotationOverlay } from '@/components/reading/annotation-overlay-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import type { LectureSessionRow } from '@/lib/annotations/types';
import { cn } from '@/lib/utils';

/**
 * Real Lecture Mode session picker (PRD §7.3/§8.9). Lists the chapter's
 * PUBLISHED sessions (loaded server-side through the RLS-applying client, so a
 * student never even receives an unpublished one), lets the reader switch which
 * one to replay via a shareable `?session=<id>` URL param, and toggles the
 * read-only ink overlay on/off client-side.
 *
 * Selection is URL-driven (RSC re-renders with the chosen session's
 * annotations); visibility is local state shared with the overlay canvas via
 * {@link useAnnotationOverlay}.
 */
export function SessionSelector({
  sessions,
  selectedSessionId,
}: {
  sessions: LectureSessionRow[];
  selectedSessionId: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { overlayVisible, setOverlayVisible } = useAnnotationOverlay();

  const label = (
    <div className="mb-2.5 font-mono text-xs uppercase tracking-wide text-muted">
      Lecture annotations
    </div>
  );

  // No published session for this chapter -> honest empty state, no controls.
  if (sessions.length === 0) {
    return (
      <div>
        {label}
        <div className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted">
          공개된 판서 없음
        </div>
      </div>
    );
  }

  const selected = sessions.find((s) => s.id === selectedSessionId) ?? null;

  function hrefForSession(sessionId: string): string {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('session', sessionId);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div>
      {label}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2 text-left text-sm text-ink outline-none transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-accent">
          <span className="truncate">
            {selected ? selected.title : '판서 세션 선택'}
          </span>
          <ChevronDown size={15} className="shrink-0 text-muted" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[260px]">
          {sessions.map((session) => {
            const isSelected = session.id === selectedSessionId;
            return (
              <DropdownMenuItem key={session.id} asChild>
                <Link
                  href={hrefForSession(session.id)}
                  scroll={false}
                  className="flex cursor-pointer items-start gap-2"
                >
                  <Check
                    size={14}
                    className={cn('mt-0.5 shrink-0', isSelected ? 'text-accent' : 'opacity-0')}
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{session.title}</span>
                    <span className="text-[11px] text-muted">{formatSessionDate(session)}</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <label className="mt-3 flex items-center justify-between gap-3">
        <span className="text-sm text-ink">판서 오버레이 표시</span>
        <Switch
          checked={overlayVisible}
          onCheckedChange={setOverlayVisible}
          disabled={!selected}
          aria-label="판서 오버레이 표시"
        />
      </label>
    </div>
  );
}

/** Best-effort human date for a session; falls back to nothing if unparseable. */
function formatSessionDate(session: LectureSessionRow): string {
  const iso = session.started_at ?? session.created_at;
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}
