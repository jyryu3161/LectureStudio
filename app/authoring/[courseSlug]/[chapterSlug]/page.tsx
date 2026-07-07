import { notFound, redirect } from 'next/navigation';

import { isUuid } from '@/app/authoring/_lib/ids';
import { buildPreview } from '@/app/authoring/_lib/preview';
import { renderChapterPreview } from '@/app/authoring/preview-action';
import { AuthoringStudio } from '@/components/authoring/authoring-studio';
import type { PreviewResult } from '@/components/authoring/types';
import { canEditCourse } from '@/lib/auth/guards';
import { getCourseRole, getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

import { saveChapterSource } from './actions';

interface AuthoringChapterPageProps {
  params: Promise<{ courseSlug: string; chapterSlug: string }>;
}

/**
 * Authoring Studio editor (PRD §6.1), author/admin-only. Owned by this
 * workstream -- replaces the old app/authoring/page.tsx stub.
 *
 * Route shape: `/authoring/[courseSlug]/[chapterSlug]`. MVP0's `courses`
 * table has no dedicated slug column (see app/authoring/_lib/ids.ts), so
 * `courseSlug` here is the course's own `id`.
 */
export default async function AuthoringChapterPage({ params }: AuthoringChapterPageProps) {
  const { courseSlug, chapterSlug } = await params;

  if (!isUuid(courseSlug)) {
    notFound();
  }
  const courseId = courseSlug;
  const currentPath = `/authoring/${courseSlug}/${chapterSlug}`;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  }

  const supabase = await createClient();

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title')
    .eq('id', courseId)
    .maybeSingle();
  if (courseError) {
    throw new Error(`Failed to load course: ${courseError.message}`);
  }
  if (!course) notFound();

  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('id, title, slug, source, version_id')
    .eq('course_id', courseId)
    .eq('slug', chapterSlug)
    .maybeSingle();
  if (chapterError) {
    throw new Error(`Failed to load chapter: ${chapterError.message}`);
  }
  if (!chapter) notFound();

  const role = await getCourseRole(courseId);
  if (!canEditCourse(role)) {
    return <ForbiddenNotice courseTitle={course.title} />;
  }

  let initialPreview: PreviewResult;
  try {
    initialPreview = await buildPreview(chapter.source);
  } catch (error) {
    // Never let a render hiccup take down the whole editor page -- fall
    // back to an empty preview with the failure surfaced as a warning; the
    // author can still edit and save, and the live preview effect will
    // recover on the very next debounced request.
    console.error('[authoring] initial preview render failed:', error);
    initialPreview = {
      elements: null,
      blocks: [],
      warnings: [
        {
          message: `Failed to render initial preview: ${error instanceof Error ? error.message : String(error)}`,
          line: null,
          column: null,
          fatal: true,
          ruleId: null,
          source: null,
        },
      ],
    };
  }

  return (
    <AuthoringStudio
      course={{ id: course.id, title: course.title }}
      chapter={{
        id: chapter.id,
        title: chapter.title,
        slug: chapter.slug,
        courseId,
        versionId: chapter.version_id,
      }}
      initialSource={chapter.source}
      initialPreview={initialPreview}
      onSave={saveChapterSource}
      onPreview={renderChapterPreview}
    />
  );
}

function ForbiddenNotice({ courseTitle }: { courseTitle: string }) {
  return (
    <div className="flex h-full items-center justify-center p-12 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Authoring Studio</p>
        <h1 className="mt-2 font-serif text-2xl text-ink">Access restricted</h1>
        <p className="mt-2 text-sm text-muted">
          You need an author or admin role on <span className="font-medium text-ink">{courseTitle}</span> to
          edit it here.
        </p>
      </div>
    </div>
  );
}
