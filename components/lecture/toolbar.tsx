'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Crosshair,
  Eraser,
  Highlighter,
  LogOut,
  Pen,
  Printer,
  Trash2,
  Type,
} from 'lucide-react';

import type { AnnotationTool } from '@/components/annotation';
import type { SyncStatus } from '@/components/annotation';
import { ANNOTATION_COLORS, type AnnotationColor } from '@/lib/annotations/types';
import type { LectureSessionRow } from '@/lib/annotations/types';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ToolDef {
  id: Exclude<AnnotationTool, null>;
  label: string;
  Icon: typeof Pen;
}

const TOOLS: ToolDef[] = [
  { id: 'pen', label: '펜', Icon: Pen },
  { id: 'highlighter', label: '형광펜', Icon: Highlighter },
  { id: 'text', label: '텍스트', Icon: Type },
  { id: 'eraser', label: '지우개', Icon: Eraser },
  { id: 'laser', label: '레이저', Icon: Crosshair },
];

const COLOR_LABELS: Record<AnnotationColor, string> = {
  '#16181c': '검정',
  '#e11d2e': '빨강',
  '#2563eb': '파랑',
};

const SYNC_LABELS: Record<SyncStatus, string> = {
  saved: '저장됨',
  saving: '저장 중…',
  offline: '오프라인',
  error: '저장 실패',
};

const SYNC_TONE: Record<SyncStatus, string> = {
  saved: 'text-muted',
  saving: 'text-accent',
  offline: 'text-amber-700',
  error: 'text-red-700',
};

export interface LectureToolbarProps {
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  canDraw: boolean;
  color: AnnotationColor;
  onColorChange: (color: AnnotationColor) => void;
  session: LectureSessionRow | null;
  sessionBusy: boolean;
  sessionError: string | null;
  hasAnnotations: boolean;
  syncState: { status: SyncStatus; pending: number };
  onRetrySync: () => void;
  onStart: () => void;
  onEnd: () => void;
  onTogglePublished: () => void;
  onClearAll: () => void;
  onPrint: () => void;
  exitHref: string;
  courseCode: string | null;
  courseTitle: string;
}

export function LectureToolbar({
  tool,
  onToolChange,
  canDraw,
  color,
  onColorChange,
  session,
  sessionBusy,
  sessionError,
  hasAnnotations,
  syncState,
  onRetrySync,
  onStart,
  onEnd,
  onTogglePublished,
  onClearAll,
  onPrint,
  exitHref,
  courseCode,
  courseTitle,
}: LectureToolbarProps) {
  const [clearOpen, setClearOpen] = useState(false);
  const isActive = session?.status === 'active';
  const isEnded = session?.status === 'ended';

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle bg-rail px-4 py-2.5 text-white">
      {/* Course identity. */}
      <div className="flex min-w-0 items-baseline gap-2 pr-1">
        {courseCode ? (
          <span className="font-mono text-[13px] font-semibold tracking-tight text-white">
            {courseCode}
          </span>
        ) : null}
        <span className="truncate text-[12px] text-white/55">{courseTitle}</span>
      </div>

      <Divider />

      {/* Drawing tools. */}
      <div role="group" aria-label="주석 도구" className="flex items-center gap-1">
        {TOOLS.map(({ id, label, Icon }) => {
          const pressed = tool === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={pressed}
              aria-label={label}
              title={canDraw ? label : `${label} (세션 시작 후 사용 가능)`}
              disabled={!canDraw}
              onClick={() => onToolChange(pressed ? null : id)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                'disabled:cursor-not-allowed disabled:opacity-35',
                pressed ? 'bg-white text-ink' : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      <Divider />

      {/* Palette. */}
      <div role="group" aria-label="색상" className="flex items-center gap-1.5">
        {ANNOTATION_COLORS.map((c) => {
          const selected = color === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={selected}
              aria-label={COLOR_LABELS[c]}
              title={COLOR_LABELS[c]}
              disabled={!canDraw}
              onClick={() => onColorChange(c)}
              className={cn(
                'h-6 w-6 rounded-full border transition-transform',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-1 focus-visible:ring-offset-rail',
                'disabled:cursor-not-allowed disabled:opacity-35',
                selected ? 'scale-110 border-white ring-2 ring-white/70' : 'border-white/30',
              )}
              style={{ backgroundColor: c }}
            />
          );
        })}
      </div>

      <Divider />

      {/* Clear all (confirm). */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            disabled={!hasAnnotations}
            title="전체 지우기"
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
              'disabled:cursor-not-allowed disabled:opacity-35',
            )}
          >
            <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
            <span className="hidden sm:inline">전체 지우기</span>
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이 세션의 주석을 모두 지울까요?</DialogTitle>
            <DialogDescription>
              현재 세션에서 이 챕터에 그린 모든 주석이 삭제됩니다. 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">취소</Button>
            </DialogClose>
            <Button
              variant="default"
              onClick={() => {
                onClearAll();
                setClearOpen(false);
              }}
            >
              모두 지우기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Right-aligned cluster: sync + session + export + exit. */}
      <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Sync status chip. */}
        <div
          className="flex items-center gap-1.5 text-[11px]"
          role="status"
          aria-live="polite"
          title="주석 저장 상태"
        >
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              syncState.status === 'saved' && 'bg-emerald-400',
              syncState.status === 'saving' && 'bg-sky-400',
              syncState.status === 'offline' && 'bg-amber-400',
              syncState.status === 'error' && 'bg-red-400',
            )}
            aria-hidden="true"
          />
          <span className={cn('font-medium', SYNC_TONE[syncState.status], 'text-white/80')}>
            {SYNC_LABELS[syncState.status]}
            {syncState.pending > 0 ? ` · ${syncState.pending}` : ''}
          </span>
          {syncState.status === 'error' && (
            <button
              type="button"
              onClick={onRetrySync}
              className="rounded px-1 font-medium text-white underline hover:text-white/80"
            >
              재시도
            </button>
          )}
        </div>

        <Divider />

        {/* Session lifecycle. */}
        <div className="flex items-center gap-2">
          {session && (
            <span
              className="hidden max-w-[180px] truncate text-[12px] text-white/70 md:inline"
              title={session.title}
            >
              {session.title}
              <span className="ml-1.5 text-white/40">{isActive ? '· 진행 중' : '· 종료됨'}</span>
            </span>
          )}

          {!isActive && (
            <Button size="sm" variant="accent" onClick={onStart} disabled={sessionBusy}>
              {session ? '새 세션 시작' : '세션 시작'}
            </Button>
          )}

          {isActive && (
            <Button
              size="sm"
              variant="outline"
              onClick={onEnd}
              disabled={sessionBusy}
              className="border-white/25 bg-transparent text-white hover:bg-white/10"
            >
              세션 종료
            </Button>
          )}

          {/* Publish toggle — only meaningful once ended (PRD: 종료 후 공개). */}
          <label
            className={cn(
              'flex items-center gap-1.5 text-[12px]',
              isEnded ? 'text-white/80' : 'text-white/35',
            )}
            title={
              isEnded
                ? '학생에게 공개'
                : '세션을 종료한 뒤에 공개할 수 있습니다'
            }
          >
            <span>공개</span>
            <Switch
              checked={session?.published ?? false}
              onCheckedChange={onTogglePublished}
              disabled={!isEnded || sessionBusy}
              aria-label="세션 공개"
            />
          </label>
        </div>

        <Divider />

        {/* Export + exit. */}
        <button
          type="button"
          onClick={onPrint}
          title="PDF로 내보내기"
          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <Printer size={16} strokeWidth={1.8} aria-hidden="true" />
          <span className="hidden lg:inline">PDF로 내보내기</span>
        </button>

        <Link
          href={exitHref}
          title="나가기 (읽기 모드로)"
          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />
          <span className="hidden lg:inline">나가기</span>
        </Link>
      </div>

      {sessionError && (
        <p className="w-full text-[12px] text-red-300" role="alert">
          {sessionError}
        </p>
      )}
    </header>
  );
}

function Divider() {
  return <span className="hidden h-5 w-px bg-white/15 sm:block" aria-hidden="true" />;
}
