import { notFound, redirect } from 'next/navigation';

import { listAnnotations, listSessions, type AnnotationRow, type LectureSessionRow } from '@/lib/annotations';
import { canViewInstructorContent } from '@/lib/auth/guards';
import { getCourseRole } from '@/lib/auth/session';
import { ensureStableIds, type Block } from '@/lib/content';
import { mystNodesToPlainText, renderBlocks } from '@/lib/render';
import { createClient } from '@/lib/supabase/server';

import { LectureStage } from '@/components/lecture/lecture-stage';
import type { InstructorNote, LectureTocChapter } from '@/components/lecture/lecture-stage';

// `courses.id` is a uuid column -- the `courseSlug` route segment is the
// course id (same convention as Reading Mode). Validate shape up front so a
// stray segment never hits Postgres as a raw uuid filter.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LecturePageParams {
  courseSlug: string;
  chapterSlug: string;
}

interface LecturePageData {
  course: { id: string; title: string; subtitle: string | null };
  chapter: { id: string; title: string; slug: string; order_index: number; source: string };
  chapters: LectureTocChapter[];
}

async function loadLecturePageData(
  courseId: string,
  chapterSlug: string,
): Promise<LecturePageData | null> {
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
    .select('id, title, slug, order_index, source')
    .eq('course_id', course.id)
    .eq('slug', chapterSlug)
    .maybeSingle();
  if (!chapter) return null;

  const { data: chapters } = await supabase
    .from('chapters')
    .select('id, title, slug, order_index')
    .eq('course_id', course.id)
    .order('order_index', { ascending: true });

  return { course, chapter, chapters: chapters ?? [] };
}

export default async function LectureChapterPage({
  params,
}: {
  params: Promise<LecturePageParams>;
}) {
  const { courseSlug, chapterSlug } = await params;
  const data = await loadLecturePageData(courseSlug, chapterSlug);
  if (!data) notFound();
  const { course, chapter, chapters } = data;

  // Role gate (PRD §8): only author/instructor/admin may present. A
  // student/guest is sent to the equivalent Reading Mode permalink -- Lecture
  // Mode is the presenter's surface, Reading Mode is the consumer's.
  const role = await getCourseRole(course.id);
  if (!canViewInstructorContent(role)) {
    redirect(`/reading/${course.id}/${chapter.slug}`);
  }

  // Parse MyST source server-side (read-only; never persists back).
  const { blocks } = ensureStableIds(chapter.source);

  // The presented body is the SAME content students see: instructor-note
  // blocks are stripped from the body (rendered with a non-elevated role) and
  // surfaced only in the right panel below. This upholds the instructor-note
  // protection invariant (PRD §5.6/§8.4) -- their text never enters the shared
  // body tree.
  const body = await renderBlocks(blocks, { role: 'student' });

  // Public (student-visible) blocks: their ids in order (for the "current
  // block" indicator) and their current content hashes (for drift detection).
  const publicBlocks = blocks.filter((b) => b.visibility !== 'instructor');
  const blockOrder = publicBlocks.map((b) => b.id);
  const blockHashes: Record<string, string> = {};
  for (const b of publicBlocks) blockHashes[b.id] = b.contentHash;

  // Instructor notes -> right panel only (plain text, never in the body).
  const instructorNotes: InstructorNote[] = blocks
    .filter((b: Block) => b.visibility === 'instructor')
    .map((b) => ({
      id: b.id,
      text: mystNodesToPlainText(b.node.children ?? []) || '(빈 강사 노트)',
    }));

  // Resume the most recent ACTIVE session for this chapter (sessions come back
  // newest-first); otherwise the presenter must start one before drawing.
  const sessions = await listSessions(chapter.id);
  const activeSession: LectureSessionRow | null =
    sessions.find((s) => s.status === 'active') ?? null;
  const initialAnnotations: AnnotationRow[] = activeSession
    ? await listAnnotations(activeSession.id)
    : [];

  return (
    <LectureStage
      courseId={course.id}
      chapterId={chapter.id}
      chapterSlug={chapter.slug}
      courseTitle={course.title}
      courseCode={course.subtitle}
      chapterTitle={chapter.title}
      chapterOrder={chapter.order_index}
      chapters={chapters}
      instructorNotes={instructorNotes}
      blockOrder={blockOrder}
      blockHashes={blockHashes}
      initialSession={activeSession}
      initialAnnotations={initialAnnotations}
    >
      {body}
    </LectureStage>
  );
}
