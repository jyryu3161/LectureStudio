/**
 * GET /api/export/epub?chapterId=<uuid> -- streams a single chapter as a
 * valid EPUB3 file (PRD §5.6, MVP4).
 *
 * ACCESS CONTROL: the chapter (and its course) are read through the
 * request-scoped, RLS-applying Supabase server client -- never a service-role
 * client. So visibility matches Reading Mode exactly: an enrolled member
 * (incl. student) can export; a signed-out guest can export only a PUBLIC
 * course's chapter; anything the caller may not read returns 404 (never
 * confirming a private course's existence).
 *
 * EXPORT INVARIANT: `buildChapterEpub` filters to public-visibility blocks
 * unconditionally, so `instructor-note` content is stripped server-side
 * regardless of the requester's role (PRD §5.6). Enforced in lib/export.
 */
import { readChapterSource } from '@/lib/chapters/source';
import { buildChapterEpub, epubFilenameStem } from '@/lib/export';
import { createClient } from '@/lib/supabase/server';

// Uses cookies + the Node-only myst parser: force dynamic, Node runtime.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const chapterId = new URL(request.url).searchParams.get('chapterId');
  if (!chapterId || !UUID_RE.test(chapterId)) {
    return new Response('Invalid or missing chapterId', { status: 400 });
  }

  const supabase = await createClient();

  const { data: chapter } = await supabase
    .from('chapters')
    .select('id, course_id, title')
    .eq('id', chapterId)
    .maybeSingle();
  // 404 covers both "no such chapter" and "not allowed to read it" (RLS) --
  // intentionally indistinguishable, matching the Reading page's 404 policy.
  if (!chapter || !chapter.course_id) return new Response('Not found', { status: 404 });

  // `chapters.source` is no longer REST-readable (migration 0007). The RLS fetch
  // above authorized the caller; read the raw source via the elevated helper.
  // `buildChapterEpub` then filters to public-visibility blocks unconditionally,
  // so instructor-note prose is still stripped server-side (PRD §5.6).
  const sourceRow = await readChapterSource(chapter.id);
  if (sourceRow == null) return new Response('Not found', { status: 404 });

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, subtitle')
    .eq('id', chapter.course_id)
    .maybeSingle();
  if (!course) return new Response('Not found', { status: 404 });

  const epub = await buildChapterEpub({
    courseTitle: course.title,
    courseSubtitle: course.subtitle,
    chapterTitle: chapter.title,
    source: sourceRow.source,
  });

  const stem = epubFilenameStem(chapter.title);
  // RFC 5987 filename* carries the (possibly Korean) title for capable
  // clients; the ASCII `filename` is a safe fallback.
  const utf8Name = encodeURIComponent(`${chapter.title}.epub`);

  // Copy into a fresh ArrayBuffer (a valid BodyInit) -- a bare Uint8Array
  // isn't in the DOM `BodyInit` union under this TS lib.
  const body = new Uint8Array(epub.byteLength);
  body.set(epub);

  return new Response(body.buffer, {
    status: 200,
    headers: {
      'content-type': 'application/epub+zip',
      'content-disposition': `attachment; filename="${stem}.epub"; filename*=UTF-8''${utf8Name}`,
      'content-length': String(body.byteLength),
      'cache-control': 'no-store',
    },
  });
}
