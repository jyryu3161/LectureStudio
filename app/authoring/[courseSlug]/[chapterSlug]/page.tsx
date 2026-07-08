import { notFound, redirect } from 'next/navigation';

import { isUuid } from '@/app/authoring/_lib/ids';
import { buildPreview } from '@/app/authoring/_lib/preview';
import { renderChapterPreview } from '@/app/authoring/preview-action';
import { AuthoringStudio } from '@/components/authoring/authoring-studio';
import type { PreviewResult } from '@/components/authoring/types';
import { listArtifacts, type AiArtifact } from '@/lib/ai/artifacts';
import { listDemoApps } from '@/lib/demos/actions';
import type { DemoApp } from '@/lib/demos/types';
import { canEditCourse } from '@/lib/auth/guards';
import { getCourseRole, getCurrentUser } from '@/lib/auth/session';
import { readChapterSource } from '@/lib/chapters/source';
import { createClient } from '@/lib/supabase/server';

import { reloadChapterSource, saveChapterSource } from './actions';

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
    .select('id, title, slug, version_id')
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

  // `chapters.source` is no longer REST-readable (migration 0007). This is the
  // author's editor, and the canEditCourse gate above already authorized them,
  // so read the full source (instructor notes included — authors may see them)
  // via the elevated helper.
  const source = (await readChapterSource(chapter.id))?.source ?? '';

  let initialPreview: PreviewResult;
  try {
    initialPreview = await buildPreview(source);
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

  // AI drafts + history for this chapter. Never let a listing hiccup take down
  // the editor — fall back to an empty list (the panel can still generate).
  let initialArtifacts: AiArtifact[] = [];
  try {
    initialArtifacts = await listArtifacts(chapter.id);
  } catch (error) {
    console.error('[authoring] failed to list AI artifacts:', error);
  }

  // Course marimo demos. Never let a listing hiccup take down the editor —
  // fall back to an empty list (the panel can still create + build).
  let initialDemos: DemoApp[] = [];
  try {
    const demosResult = await listDemoApps(courseId);
    if (demosResult.ok) initialDemos = demosResult.data;
    else console.error('[authoring] failed to list demos:', demosResult.error);
  } catch (error) {
    console.error('[authoring] failed to list demos:', error);
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
      initialSource={source}
      initialPreview={initialPreview}
      onSave={saveChapterSource}
      onPreview={renderChapterPreview}
      onReloadSource={reloadChapterSource}
      initialArtifacts={initialArtifacts}
      initialDemos={initialDemos}
      currentUserId={user.id}
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
