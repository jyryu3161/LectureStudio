'use client';

import { NotebookPen } from 'lucide-react';

import type { LectureSessionRow } from '@/lib/annotations/types';
import type { InstructorNote } from './lecture-stage';

export interface InstructorPanelProps {
  notes: InstructorNote[];
  session: LectureSessionRow | null;
  /** 0-based index of the current public block, or -1 if unknown. */
  currentBlockIndex: number;
  totalBlocks: number;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Right-hand instructor panel (PRD §8.4): instructor-note content that is
 * deliberately kept OUT of the shared body (students never see it), a simple
 * "current block" indicator driven by the stage's IntersectionObserver-lite
 * scroll tracking, and live session info.
 */
export function InstructorPanel({
  notes,
  session,
  currentBlockIndex,
  totalBlocks,
}: InstructorPanelProps) {
  const statusLabel = session
    ? session.status === 'active'
      ? '진행 중'
      : '종료됨'
    : '세션 없음';

  return (
    <aside
      aria-label="강사 패널"
      className="flex h-full w-[300px] flex-col gap-6 overflow-y-auto border-l border-border-subtle bg-canvas px-5 py-6"
    >
      {/* Session info. */}
      <section>
        <h2 className="mb-2.5 font-mono text-xs uppercase tracking-wide text-muted">세션</h2>
        {session ? (
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">제목</dt>
              <dd className="min-w-0 truncate text-ink" title={session.title}>
                {session.title}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">상태</dt>
              <dd className="text-ink">{statusLabel}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">공개</dt>
              <dd className="text-ink">{session.published ? '공개됨' : '비공개'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">시작</dt>
              <dd className="text-ink">{formatTime(session.started_at)}</dd>
            </div>
            {session.status === 'ended' && (
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted">종료</dt>
                <dd className="text-ink">{formatTime(session.ended_at)}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted">
            세션을 시작하면 이 챕터에 주석을 그릴 수 있습니다.
          </p>
        )}
      </section>

      {/* Current block indicator. */}
      <section>
        <h2 className="mb-2 font-mono text-xs uppercase tracking-wide text-muted">현재 위치</h2>
        <p className="text-sm text-ink">
          {currentBlockIndex >= 0 && totalBlocks > 0 ? (
            <>
              블록 <span className="font-medium">{currentBlockIndex + 1}</span>
              <span className="text-muted"> / {totalBlocks}</span>
            </>
          ) : (
            <span className="text-muted">—</span>
          )}
        </p>
      </section>

      {/* Instructor notes — panel only, never in the shared body. */}
      <section className="min-h-0">
        <h2 className="mb-2.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-muted">
          <NotebookPen size={13} strokeWidth={1.8} aria-hidden="true" />
          강사 노트
        </h2>
        {notes.length === 0 ? (
          <p className="text-sm text-muted">이 챕터에는 강사 노트가 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-950"
              >
                {note.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
