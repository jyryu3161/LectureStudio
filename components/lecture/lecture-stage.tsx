'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { AnnotationLayer, useAnnotationSync } from '@/components/annotation';
import type { AnnotationTool, ToolSettings } from '@/components/annotation';
import { endSession, setPublished, startSession } from '@/lib/lecture/actions';
import type {
  AnnotationColor,
  AnnotationRow,
  LectureSessionRow,
  NewAnnotation,
} from '@/lib/annotations/types';

import { persistAnnotations } from '@/app/lecture/actions';
import { InstructorPanel } from './instructor-panel';
import { LectureChromeStyle } from './lecture-chrome-style';
import { LectureToc } from './lecture-toc';
import { LectureToolbar } from './toolbar';

export interface LectureTocChapter {
  id: string;
  title: string;
  slug: string;
  order_index: number;
}

export interface InstructorNote {
  id: string;
  text: string;
}

export interface LectureStageProps {
  courseId: string;
  chapterId: string;
  chapterSlug: string;
  courseTitle: string;
  courseCode: string | null;
  chapterTitle: string;
  chapterOrder: number;
  chapters: LectureTocChapter[];
  instructorNotes: InstructorNote[];
  /** Public block ids in document order (for the "current block" indicator). */
  blockOrder: string[];
  /** Current content hash per public block id (for drift detection). */
  blockHashes: Record<string, string>;
  initialSession: LectureSessionRow | null;
  initialAnnotations: AnnotationRow[];
  /** Server-rendered, student-visible chapter body (block sections). */
  children: ReactNode;
}

/** Base pen width in px; highlighter is widened + made translucent by the engine. */
const BASE_STROKE_WIDTH = 2.5;

function groupIdOf(a: AnnotationRow): string {
  const data = a.data as { group_id?: string };
  return data.group_id ?? a.id;
}

function draftGroupId(d: NewAnnotation): string {
  const data = d.data as { group_id?: string };
  return data.group_id ?? d.id ?? crypto.randomUUID();
}

function todaySessionTitle(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `주차 세션 ${y}-${m}-${d}`;
}

/**
 * Live Book Lecture Mode stage (PRD §8): a fullscreen presentation surface
 * with a top toolbar, a collapsible chapter TOC on the left, the shared
 * reading body in the center (with the annotation engine layered over it), and
 * an instructor panel on the right.
 *
 * Session lifecycle drives what the presenter can do:
 *   - no active session  -> tools disabled; must "세션 시작" first;
 *   - active session      -> draw/erase/text; "세션 종료" available;
 *   - ended session       -> drawing locked; publish/unpublish enabled
 *                            (PRD: 종료 후 공개), or start a fresh session.
 *
 * Annotations are optimistic + durably journaled by the sync queue
 * (components/annotation/sync.ts), flushed through the `persistAnnotations`
 * server action; unsaved ink survives reload and the sync chip surfaces
 * saving/offline/failed state so strokes are never silently lost.
 */
export function LectureStage({
  courseId,
  chapterId,
  chapterSlug,
  courseTitle,
  courseCode,
  chapterTitle,
  chapterOrder,
  chapters,
  instructorNotes,
  blockOrder,
  blockHashes,
  initialSession,
  initialAnnotations,
  children,
}: LectureStageProps) {
  const [session, setSession] = useState<LectureSessionRow | null>(initialSession);
  const [annotations, setAnnotations] = useState<AnnotationRow[]>(initialAnnotations);
  const [tool, setTool] = useState<AnnotationTool>(null);
  const [color, setColor] = useState<AnnotationColor>('#16181c');
  const [tocOpen, setTocOpen] = useState(true);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(blockOrder[0] ?? null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isActive = session?.status === 'active';
  const canDraw = isActive === true;
  // Effective tool: never let a tool capture pointer events without a live
  // session behind it (nothing to save into).
  const effectiveTool: AnnotationTool = canDraw ? tool : null;

  const toolSettings: ToolSettings = useMemo(
    () => ({ color, width: BASE_STROKE_WIDTH }),
    [color],
  );

  // --- Sync queue (keyed by session; recreated when the session changes). ---
  const sessionIdForQueue = session?.id ?? 'no-session';
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const { state: syncState, queue } = useAnnotationSync<NewAnnotation>({
    sessionId: sessionIdForQueue,
    flush: async ({ creates, deletes }) => {
      const active = sessionRef.current;
      if (!active) return; // no session -> nothing persistable
      await persistAnnotations(active.id, { creates, deletes });
    },
  });

  // --- Drift detection: annotation hash vs current block hash. -------------
  const staleGroupIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of annotations) {
      const current = blockHashes[a.block_id];
      const against = a.created_against_hash;
      if (against && current && current !== against) set.add(groupIdOf(a));
    }
    return set;
  }, [annotations, blockHashes]);

  // --- Optimistic annotation mutations. ------------------------------------
  const handleCreate = useCallback(
    (drafts: NewAnnotation[]) => {
      const active = sessionRef.current;
      if (!active) return;
      const now = new Date().toISOString();
      const rows: AnnotationRow[] = drafts.map((d) => ({
        id: d.id ?? crypto.randomUUID(),
        course_id: courseId,
        chapter_id: chapterId,
        block_id: d.block_id,
        course_version_id: null,
        lecture_session_id: active.id,
        author_id: null,
        annotation_type: d.annotation_type,
        coord_space: 'block_normalized',
        created_against_hash: d.created_against_hash ?? null,
        data: d.data,
        style: d.style,
        scope: d.scope ?? 'session',
        created_at: now,
        updated_at: now,
      }));
      setAnnotations((prev) => [...prev, ...rows]);
      queue.enqueueCreates(drafts.map((d) => ({ groupId: draftGroupId(d), draft: d })));
    },
    [courseId, chapterId, queue],
  );

  const handleErase = useCallback(
    (groupId: string) => {
      setAnnotations((prev) => prev.filter((a) => groupIdOf(a) !== groupId));
      queue.enqueueDelete(groupId);
    },
    [queue],
  );

  const handleClearAll = useCallback(() => {
    const groups = new Set(annotations.map(groupIdOf));
    for (const g of groups) queue.enqueueDelete(g);
    setAnnotations([]);
  }, [annotations, queue]);

  // --- Session lifecycle. ---------------------------------------------------
  const handleStart = useCallback(async () => {
    setSessionBusy(true);
    setSessionError(null);
    try {
      const row = await startSession(chapterId, todaySessionTitle());
      setSession(row);
      setAnnotations([]); // a fresh session starts with a clean layer
      setTool('pen');
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : '세션을 시작하지 못했습니다.');
    } finally {
      setSessionBusy(false);
    }
  }, [chapterId]);

  const handleEnd = useCallback(async () => {
    if (!session) return;
    setSessionBusy(true);
    setSessionError(null);
    try {
      const row = await endSession(session.id);
      setSession(row);
      setTool(null);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : '세션을 종료하지 못했습니다.');
    } finally {
      setSessionBusy(false);
    }
  }, [session]);

  const handleTogglePublished = useCallback(async () => {
    if (!session) return;
    setSessionBusy(true);
    setSessionError(null);
    try {
      const row = await setPublished(session.id, !session.published);
      setSession(row);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : '공개 설정을 변경하지 못했습니다.');
    } finally {
      setSessionBusy(false);
    }
  }, [session]);

  // Escape exits the active tool (PRD §8.2). The text-input inside the layer
  // handles its own Escape first (stopping propagation is not needed since it
  // only closes the input); at the stage level we drop the tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tool !== null) setTool(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool]);

  // Current block indicator: whichever public block is nearest the vertical
  // center of the scroll viewport (kept intentionally simple).
  useEffect(() => {
    const root = scrollRef.current;
    const container = containerRef.current;
    if (!root || !container) return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      const rootBox = root.getBoundingClientRect();
      const center = rootBox.top + rootBox.height / 2;
      let best: string | null = null;
      let bestDist = Infinity;
      container.querySelectorAll<HTMLElement>('[data-block-id]').forEach((el) => {
        const id = el.getAttribute('data-block-id');
        if (!id) return;
        const box = el.getBoundingClientRect();
        const elCenter = box.top + box.height / 2;
        const dist = Math.abs(elCenter - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = id;
        }
      });
      if (best) setCurrentBlockId(best);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const currentBlockIndex =
    currentBlockId != null ? blockOrder.indexOf(currentBlockId) : -1;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-canvas">
      <LectureChromeStyle />

      <div data-lecture-chrome>
        <LectureToolbar
          tool={tool}
          onToolChange={setTool}
          canDraw={canDraw}
          color={color}
          onColorChange={setColor}
          session={session}
          sessionBusy={sessionBusy}
          sessionError={sessionError}
          hasAnnotations={annotations.length > 0}
          syncState={syncState}
          onRetrySync={() => queue.retry()}
          onStart={handleStart}
          onEnd={handleEnd}
          onTogglePublished={handleTogglePublished}
          onClearAll={handleClearAll}
          onPrint={() => window.print()}
          exitHref={`/reading/${courseId}/${chapterSlug}`}
          courseCode={courseCode}
          courseTitle={courseTitle}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Collapsible TOC (left). */}
        <div data-lecture-chrome className={tocOpen ? 'shrink-0' : 'hidden'}>
          <LectureToc
            courseId={courseId}
            chapters={chapters}
            currentChapterId={chapterId}
            onCollapse={() => setTocOpen(false)}
          />
        </div>

        {/* Center stage: the shared body + annotation overlay. */}
        <div
          ref={scrollRef}
          data-lecture-stage
          className="relative min-w-0 flex-1 overflow-y-auto bg-paper"
        >
          {!tocOpen && (
            <button
              type="button"
              data-lecture-chrome
              onClick={() => setTocOpen(true)}
              className="sticky top-3 z-30 ml-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-medium text-ink shadow-sm hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="목차 열기"
            >
              목차
            </button>
          )}
          <article className="mx-auto max-w-[820px] px-6 py-12 sm:px-10 lg:px-14">
            <p
              data-lecture-chrome
              className="mb-8 font-mono text-xs uppercase tracking-[0.09em] text-muted"
            >
              Chapter {String(chapterOrder).padStart(2, '0')} · {chapterTitle}
            </p>
            <div ref={containerRef} data-annotation-root className="relative">
              {children}
              <AnnotationLayer
                containerRef={containerRef}
                annotations={annotations}
                tool={effectiveTool}
                toolSettings={toolSettings}
                staleGroupIds={staleGroupIds}
                onCreate={handleCreate}
                onErase={handleErase}
                onDiscard={handleErase}
              />
            </div>
          </article>
        </div>

        {/* Instructor panel (right). */}
        <div data-lecture-chrome className="hidden shrink-0 lg:block">
          <InstructorPanel
            notes={instructorNotes}
            session={session}
            currentBlockIndex={currentBlockIndex}
            totalBlocks={blockOrder.length}
          />
        </div>
      </div>
    </div>
  );
}
