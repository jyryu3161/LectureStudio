import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { AnnotationOverlayProvider } from '@/components/reading/annotation-overlay-context';
import { ReadingAnnotationCanvas } from '@/components/reading/reading-annotation-canvas';
import { listAnnotations, listPublishedSessions } from '@/lib/annotations';
import type { AnnotationRow, LectureSessionRow } from '@/lib/annotations/types';
import { filterByVisibility } from '@/lib/auth/guards';
import { getCourseRole } from '@/lib/auth/session';
import { readChapterSource } from '@/lib/chapters/source';
import { ensureStableIds, type Block } from '@/lib/content';
import { mystNodesToPlainText, renderBlocks } from '@/lib/render';
import type { CourseRole } from '@/lib/supabase/roles';
import { createClient } from '@/lib/supabase/server';

import { ChapterToc, type TocChapter } from './chapter-toc';
import { OnThisPageNav, type OnThisPageItem } from './on-this-page-nav';
import { PersonalNotes } from './personal-notes';
import { ReadingTopBar } from './reading-top-bar';
import { SessionSelector } from './session-selector';

// `courses.id` is a `uuid` column (see supabase/migrations/0001_init.sql) --
// there is no `courses.slug` column in the MVP0 schema, so the `courseSlug`
// route segment is the course's id. Validate the shape up front so an
// obviously-bad value (e.g. a stray path segment) never reaches Postgres as
// a raw `uuid` filter, which would surface as a noisy query error instead of
// a clean 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChapterPageParams {
  courseSlug: string;
  chapterSlug: string;
}

interface ChapterPageData {
  course: { id: string; title: string; subtitle: string | null };
  chapter: { id: string; title: string; slug: string; order_index: number };
  chapters: TocChapter[];
  role: CourseRole | null;
  headings: OnThisPageItem[];
  renderedBlocks: ReactElement[];
  // block id → current content hash, for annotation drift. Carries no block
  // *text*, so it is safe to serialize into a student's response (unlike the
  // raw `chapters.source`, which would smuggle instructor-note prose across
  // the RSC boundary -- see below).
  blockHashes: Record<string, string>;
}

/**
 * Loads and fully prepares exactly what this page renders, via the
 * request-scoped (RLS-applying) Supabase server client -- never a
 * service-role client -- so a private course or an instructor-only chapter
 * reference is invisible to a non-member the same way it would be to any
 * other API consumer. Returns `null` for "not found OR not allowed to see
 * it"; the two are intentionally indistinguishable to the caller (see the
 * not-found page copy) so this never confirms a private course's existence
 * to a guest.
 *
 * SECURITY (PRD Sec 5.6 / 15.3): the raw `chapters.source` -- which contains
 * instructor-note prose -- is parsed, role-filtered, and rendered HERE and
 * is NEVER returned to the caller. Only the visibility-filtered
 * `renderedBlocks`, the visible headings, and a text-free block-hash map
 * leave this function. This keeps instructor-only text out of the RSC flight
 * payload entirely (in `next dev`, React serializes an async function's
 * returned value into DEV debug rows; returning `source` would leak the
 * notes to a student via view-source even though the visible DOM is clean).
 */
async function loadChapterPageData(
  courseId: string,
  chapterSlug: string,
): Promise<ChapterPageData | null> {
  if (!UUID_RE.test(courseId)) return null;

  const supabase = await createClient();

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, subtitle')
    .eq('id', courseId)
    .maybeSingle();
  if (!course) return null;

  const { data: chapter } = await supabase
    .from('chapters')
    .select('id, title, slug, order_index')
    .eq('course_id', course.id)
    .eq('slug', chapterSlug)
    .maybeSingle();
  if (!chapter) return null;

  // The raw `chapters.source` (which carries instructor-note prose) is no longer
  // REST-readable by the request-scoped client (migration 0007). Read it here via
  // the elevated helper — the RLS chapter fetch above already proved this viewer
  // may see the chapter; the source is parsed + role-filtered below and never
  // leaves this function.
  const sourceRow = await readChapterSource(chapter.id);
  if (sourceRow == null) return null;
  const source = sourceRow.source;

  const { data: chapters } = await supabase
    .from('chapters')
    .select('id, title, slug, order_index')
    .eq('course_id', course.id)
    .order('order_index', { ascending: true });

  // Viewer's role on THIS course, looked up via the same request-scoped
  // (RLS-backed) client -- never assume/pass a role down from anywhere else.
  const role = await getCourseRole(course.id);

  // Parse the chapter's MyST source into Blocks. `blocks` (which still holds
  // instructor-only prose) stays a LOCAL here and never becomes part of this
  // function's returned/awaited value. This never persists back to
  // `chapters.source`/`content_blocks` (that write-through is the Content
  // Engine/Authoring path) -- Reading Mode is read-only.
  const { blocks } = ensureStableIds(source);

  // Derive the "On this page" heading list from the same visibility-filtered
  // list `renderBlocks` renders from, never from the raw `blocks` array, so an
  // instructor-only block could never leak into the page via a side channel.
  const visibleBlocks = filterByVisibility(blocks, role);
  const headings: OnThisPageItem[] = visibleBlocks
    .filter((block) => block.blockType === 'heading' && headingDepth(block) >= 2)
    .map((block) => ({
      id: block.id,
      depth: headingDepth(block),
      text: mystNodesToPlainText(block.node.children) || 'Untitled section',
    }));

  // `renderBlocks` performs its own server-side visibility filtering
  // (defense-in-depth), so its output already excludes instructor-only text.
  const renderedBlocks = await renderBlocks(blocks, { role });

  const blockHashes: Record<string, string> = {};
  for (const block of blocks) blockHashes[block.id] = block.contentHash;

  return {
    course,
    chapter: {
      id: chapter.id,
      title: chapter.title,
      slug: chapter.slug,
      order_index: chapter.order_index,
    },
    chapters: chapters ?? [],
    role,
    headings,
    renderedBlocks,
    blockHashes,
  };
}

/** Heading depth for a Block, preferring the denormalized metadata (see lib/content/blocks.ts). */
function headingDepth(block: Block): number {
  const metaDepth = block.metadata.depth;
  if (typeof metaDepth === 'number') return metaDepth;
  const nodeDepth = block.node.depth;
  return typeof nodeDepth === 'number' ? nodeDepth : 2;
}

/** The stroke/text group an annotation belongs to (multi-block strokes share one). */
function annotationGroupId(annotation: AnnotationRow): string {
  const data = annotation.data as { group_id?: string };
  return data.group_id ?? annotation.id;
}

/**
 * Computes which annotation *groups* have drifted (PRD §8.7): an annotation is
 * stale when the block's CURRENT content hash no longer matches the hash the
 * annotation was drawn against (or the block no longer exists). Grouping means a
 * multi-block stroke is flagged as a whole. Drift is surfaced as a badge and
 * dimming in the overlay -- never a silent reposition or hide.
 */
function computeStaleGroupIds(
  annotations: AnnotationRow[],
  blockHashes: Record<string, string>,
): string[] {
  const stale = new Set<string>();
  for (const a of annotations) {
    if (!a.created_against_hash) continue; // nothing to compare against
    const current = blockHashes[a.block_id];
    if (current === undefined || current !== a.created_against_hash) {
      stale.add(annotationGroupId(a));
    }
  }
  return [...stale];
}

/**
 * Resolves the session to replay + its annotations for the reading overlay.
 * Students/guests only ever get PUBLISHED sessions (RLS-enforced in
 * `listPublishedSessions`/`listAnnotations` via the request-scoped client).
 * The `?session=` param picks one; an absent/invalid/hidden id falls back to
 * the most recent published session.
 */
async function loadSessionOverlay(
  chapterId: string,
  requestedSessionId: string | undefined,
): Promise<{
  sessions: LectureSessionRow[];
  selectedSessionId: string | null;
  annotations: AnnotationRow[];
}> {
  const sessions = await listPublishedSessions(chapterId);
  if (sessions.length === 0) {
    return { sessions, selectedSessionId: null, annotations: [] };
  }

  const requested = requestedSessionId
    ? sessions.find((s) => s.id === requestedSessionId)
    : undefined;
  const selected = requested ?? sessions[0];
  const annotations = await listAnnotations(selected.id);
  return { sessions, selectedSessionId: selected.id, annotations };
}

export default async function ChapterReadingPage({
  params,
  searchParams,
}: {
  params: Promise<ChapterPageParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { courseSlug, chapterSlug } = await params;
  const { session: sessionParam } = await searchParams;
  const requestedSessionId = Array.isArray(sessionParam) ? sessionParam[0] : sessionParam;
  const data = await loadChapterPageData(courseSlug, chapterSlug);
  if (!data) notFound();
  const { course, chapter, chapters, headings, renderedBlocks, blockHashes } = data;

  // Lecture-annotation overlay (PRD §7.3/§8.9). Loaded via the same
  // request-scoped RLS client -- students/guests only ever receive published
  // sessions + their annotations. Drift is computed against the freshly parsed
  // block hashes so a changed block flags (not silently moves) its ink.
  const { sessions, selectedSessionId, annotations } = await loadSessionOverlay(
    chapter.id,
    requestedSessionId,
  );
  const staleGroupIds = computeStaleGroupIds(annotations, blockHashes);

  return (
    <AnnotationOverlayProvider defaultVisible>
      <div className="flex min-h-full flex-col lg:h-full">
        <ReadingTopBar courseCode={course.subtitle} courseTitle={course.title} chapterId={chapter.id} />

        <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row lg:overflow-hidden">
        {/* Course TOC -- collapsible on mobile/tablet, persistent rail on desktop. */}
        <nav aria-label="Course chapters" className="border-b border-border-subtle lg:hidden">
          <details>
            <summary className="cursor-pointer select-none px-5 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              Contents
            </summary>
            <div className="px-5 pb-4">
              <ChapterToc courseId={course.id} chapters={chapters} currentChapterId={chapter.id} />
            </div>
          </details>
        </nav>
        <nav
          aria-label="Course chapters"
          className="hidden shrink-0 lg:block lg:h-full lg:w-64 lg:overflow-y-auto lg:border-r lg:border-border-subtle lg:px-5 lg:py-6"
        >
          <div className="mb-4 font-mono text-xs uppercase tracking-wide text-muted">Contents</div>
          <ChapterToc courseId={course.id} chapters={chapters} currentChapterId={chapter.id} />
        </nav>

        {/* Reading column. */}
        <div className="min-w-0 flex-1 lg:h-full lg:overflow-y-auto">
          <article className="mx-auto max-w-[720px] px-6 py-10 sm:px-10 lg:px-12">
            <p className="mb-6 font-mono text-xs uppercase tracking-[0.09em] text-muted">
              Chapter {String(chapter.order_index).padStart(2, '0')} · {chapter.title}
            </p>
            <ReadingAnnotationCanvas annotations={annotations} staleGroupIds={staleGroupIds}>
              {renderedBlocks}
            </ReadingAnnotationCanvas>
          </article>
        </div>

        {/* On this page / lecture annotations / notes -- collapsible on mobile/tablet, persistent rail on desktop. */}
        <aside aria-label="Chapter tools" className="border-t border-border-subtle lg:hidden">
          <details>
            <summary className="cursor-pointer select-none px-5 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              On this page &amp; notes
            </summary>
            <div className="flex flex-col gap-6 px-5 pb-6">
              <OnThisPageNav items={headings} />
              <SessionSelector sessions={sessions} selectedSessionId={selectedSessionId} />
              <PersonalNotes chapterId={chapter.id} />
            </div>
          </details>
        </aside>
        <aside
          aria-label="Chapter tools"
          className="hidden shrink-0 lg:flex lg:h-full lg:w-[300px] lg:flex-col lg:gap-7 lg:overflow-y-auto lg:border-l lg:border-border-subtle lg:px-5 lg:py-6"
        >
          <OnThisPageNav items={headings} />
          <SessionSelector sessions={sessions} selectedSessionId={selectedSessionId} />
          <PersonalNotes chapterId={chapter.id} />
        </aside>
        </div>
      </div>
    </AnnotationOverlayProvider>
  );
}
