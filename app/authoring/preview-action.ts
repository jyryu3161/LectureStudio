'use server';

import { buildPreview } from '@/app/authoring/_lib/preview';
import { MAX_CHAPTER_SOURCE_LENGTH, type PreviewActionInput, type PreviewActionResult } from '@/components/authoring/types';
import { canEditCourse } from '@/lib/auth/guards';
import { getCourseRole, getCurrentUser } from '@/lib/auth/session';

/**
 * Server Action backing the Authoring Studio's live preview
 * (components/authoring/authoring-studio.tsx), passed down as the
 * `onPreview` prop from app/authoring/[courseSlug]/[chapterSlug]/page.tsx.
 *
 * Parses the *unsaved* editor text handed to it (never persisted here --
 * see [courseSlug]/[chapterSlug]/actions.ts for the save path) and renders
 * it exactly like Reading Mode does, always as `role: 'author'` so
 * instructor-note blocks show up while drafting them (see
 * app/authoring/_lib/preview.ts).
 *
 * Requires an author/admin membership on `courseId` -- the same gate as
 * the page itself and the save action, re-checked here too since a Server
 * Action is its own public endpoint under the hood and must not trust the
 * caller.
 */
export async function renderChapterPreview(input: PreviewActionInput): Promise<PreviewActionResult> {
  const { courseId, source } = input;

  if (typeof courseId !== 'string' || courseId.length === 0) {
    return { ok: false, error: 'courseId is required.' };
  }
  if (typeof source !== 'string') {
    return { ok: false, error: 'source must be a string.' };
  }
  if (source.length > MAX_CHAPTER_SOURCE_LENGTH) {
    return {
      ok: false,
      error: `Source is too large (max ${MAX_CHAPTER_SOURCE_LENGTH.toLocaleString()} characters).`,
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: 'Sign in required.' };
  }

  const role = await getCourseRole(courseId);
  if (!canEditCourse(role)) {
    return { ok: false, error: 'You do not have permission to preview this course.' };
  }

  try {
    const preview = await buildPreview(source);
    return { ok: true, ...preview };
  } catch (error) {
    // Defensive only: buildPreview's own pieces are documented to degrade
    // gracefully rather than throw. Never let an unexpected failure here
    // surface as an unhandled rejection to the client.
    console.error('[authoring] preview render failed:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to render preview.' };
  }
}
