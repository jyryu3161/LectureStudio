'use server';

/**
 * Multi-term course reuse (PRD §10) — SERVER ONLY, elevated-role gated.
 *
 * `duplicateCourseForTerm` deep-copies a course into a brand-new `courses` row
 * for a fresh term: a new version, all chapters + content blocks (with NEW
 * stable block ids), runtime/demo CONFIG (reset to draft — must be rebuilt),
 * and optionally the PUBLISHED lecture sessions + their annotations. The
 * requester becomes the new course's `admin`; the original course is untouched.
 *
 * AUTHORIZATION: the requester must be an author/admin member of the SOURCE
 * course, or a platform app_admin. This is verified with the request-scoped
 * RLS client (not spoofable — a server action is a public endpoint, so the
 * client-side gate is never the only check). All the COPY reads/writes then go
 * through a trusted service-role client (bypasses RLS), which is required
 * because (a) `chapters.source` is revoked from the API roles (migration 0007)
 * and (b) writing into a brand-new course whose membership doesn't exist yet
 * is the documented bootstrap case (0001) that only the service role can do.
 *
 * TRANSACTIONALITY: PostgREST has no multi-statement transaction, so we use
 * careful ordering + a compensating delete. The new `courses` row is created
 * first; if any later step fails we delete it, and every child table
 * (versions, chapters → content_blocks, sessions → annotations, runtimes,
 * demos, members) cascades on `courses` delete (ON DELETE CASCADE, 0001/0002/
 * 0004/0005) — so a failure never leaves a partial course.
 *
 * NOT COPIED (per PRD): ai_artifacts, executions, unpublished sessions.
 * `student_execution_enabled` is deliberately left unset so the column DEFAULT
 * (false) applies — a fresh term always starts locked.
 */
import { randomUUID } from 'node:crypto';

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';

import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

import { remapBlockMetadataDemoId, rewriteChapterSource } from './rewrite';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

/** Trusted service-role client for the copy (bypasses RLS). */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('courses: 서버에 Supabase service-role 설정이 없습니다.');
  }
  return createServiceClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const MAX_LABEL = 80;

export interface DuplicateCourseInput {
  /** Term label, e.g. "2026-2학기". Appended to the new course title. */
  label: string;
  /** Also copy PUBLISHED lecture sessions + their annotations into the term. */
  copyPublishedAnnotations: boolean;
}

export interface DuplicateCourseResult {
  courseId: string;
  /** First chapter's slug (for a direct reading link), or null if none. */
  chapterSlug: string | null;
}

export async function duplicateCourseForTerm(
  sourceCourseId: string,
  input: DuplicateCourseInput,
): Promise<ActionResult<DuplicateCourseResult>> {
  try {
    const label = (input.label ?? '').trim();
    if (!label) throw new Error('학기 이름을 입력하세요.');
    if (label.length > MAX_LABEL) throw new Error(`학기 이름은 ${MAX_LABEL}자 이하여야 합니다.`);

    const user = await getCurrentUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    // --- Authorization: author/admin of source course, OR platform admin ---
    const rls = await createClient();
    const [{ data: member }, { data: adminRow }] = await Promise.all([
      rls
        .from('course_members')
        .select('role')
        .eq('course_id', sourceCourseId)
        .eq('user_id', user.id)
        .maybeSingle(),
      rls.from('app_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
    ]);
    const elevated = member?.role === 'author' || member?.role === 'admin';
    if (!elevated && !adminRow) {
      throw new Error('이 강의를 복제할 권한이 없습니다.');
    }

    const svc = serviceClient();

    const { data: srcCourse, error: srcErr } = await svc
      .from('courses')
      .select('id, title, subtitle, description')
      .eq('id', sourceCourseId)
      .maybeSingle();
    if (srcErr) throw new Error(`원본 강의를 읽지 못했습니다: ${srcErr.message}`);
    if (!srcCourse) throw new Error('원본 강의를 찾을 수 없습니다.');

    const newCourseId = randomUUID();
    const newVersionId = randomUUID();

    try {
      // 1. New course row. student_execution_enabled left to DEFAULT (false).
      const insCourse = await svc.from('courses').insert({
        id: newCourseId,
        title: `${srcCourse.title} · ${label}`,
        subtitle: srcCourse.subtitle,
        description: srcCourse.description,
        owner_id: user.id,
        visibility: 'private',
      });
      if (insCourse.error) throw new Error(`강의 생성 실패: ${insCourse.error.message}`);

      // 2. Fresh version, then point the course at it.
      const insVersion = await svc
        .from('course_versions')
        .insert({ id: newVersionId, course_id: newCourseId, label });
      if (insVersion.error) throw new Error(`버전 생성 실패: ${insVersion.error.message}`);
      const updCurrent = await svc
        .from('courses')
        .update({ current_version_id: newVersionId })
        .eq('id', newCourseId);
      if (updCurrent.error) throw new Error(`현재 버전 설정 실패: ${updCurrent.error.message}`);

      // 3. Requester becomes admin of the new (per-term) course.
      const insMember = await svc
        .from('course_members')
        .insert({ course_id: newCourseId, user_id: user.id, role: 'admin' });
      if (insMember.error) throw new Error(`멤버 추가 실패: ${insMember.error.message}`);

      // 4. Runtimes — CONFIG only; reset to draft (image must be rebuilt).
      const { data: runtimes, error: rtErr } = await svc
        .from('runtimes')
        .select('*')
        .eq('course_id', sourceCourseId);
      if (rtErr) throw new Error(`런타임 조회 실패: ${rtErr.message}`);
      for (const rt of runtimes ?? []) {
        const insRt = await svc.from('runtimes').insert({
          id: randomUUID(),
          course_id: newCourseId,
          name: rt.name,
          python_version: rt.python_version,
          base_image: rt.base_image,
          conda_packages: rt.conda_packages,
          pip_packages: rt.pip_packages,
          apt_packages: rt.apt_packages,
          gpu_enabled: rt.gpu_enabled,
          memory_limit: rt.memory_limit,
          timeout_seconds: rt.timeout_seconds,
          // Build artifacts reset — the recipe must be rebuilt for the term.
          status: 'draft',
          image_tag: null,
          dockerfile: null,
        });
        if (insRt.error) throw new Error(`런타임 복사 실패: ${insRt.error.message}`);
      }

      // 5. Marimo demos — CONFIG only; reset to draft (bundle must be rebuilt).
      //    Build the demo old→new id map for source/metadata remapping.
      const demoIdMap = new Map<string, string>();
      const { data: demos, error: dmErr } = await svc
        .from('marimo_apps')
        .select('*')
        .eq('course_id', sourceCourseId);
      if (dmErr) throw new Error(`데모 조회 실패: ${dmErr.message}`);
      for (const demo of demos ?? []) {
        const newDemoId = randomUUID();
        demoIdMap.set(demo.id, newDemoId);
        const insDemo = await svc.from('marimo_apps').insert({
          id: newDemoId,
          course_id: newCourseId,
          name: demo.name,
          source: demo.source,
          status: 'draft',
          bundle_path: null,
          log: '',
          created_by: user.id,
        });
        if (insDemo.error) throw new Error(`데모 복사 실패: ${insDemo.error.message}`);
      }

      // 6. Read source chapters + blocks; build old→new id maps.
      const { data: chapters, error: chErr } = await svc
        .from('chapters')
        .select('*')
        .eq('course_id', sourceCourseId)
        .order('order_index', { ascending: true });
      if (chErr) throw new Error(`챕터 조회 실패: ${chErr.message}`);
      const chapterIdMap = new Map<string, string>();
      for (const ch of chapters ?? []) chapterIdMap.set(ch.id, randomUUID());

      const { data: blocks, error: blkErr } = await svc
        .from('content_blocks')
        .select('*')
        .eq('course_id', sourceCourseId);
      if (blkErr) throw new Error(`블록 조회 실패: ${blkErr.message}`);
      // NEW block ids (id is the sole PK — see rewrite.ts header for why we
      // cannot reuse the source ids).
      const blockIdMap = new Map<string, string>();
      for (const b of blocks ?? []) blockIdMap.set(b.id, `blk_${nanoid()}`);

      // 7. Insert chapters with rewritten source (markers → new block ids,
      //    interactive-demo directives → new demo ids).
      for (const ch of chapters ?? []) {
        const newChId = chapterIdMap.get(ch.id);
        if (!newChId) continue;
        const insCh = await svc.from('chapters').insert({
          id: newChId,
          course_id: newCourseId,
          version_id: newVersionId,
          title: ch.title,
          slug: ch.slug,
          order_index: ch.order_index,
          source: rewriteChapterSource(ch.source ?? '', blockIdMap, demoIdMap),
        });
        if (insCh.error) throw new Error(`챕터 복사 실패: ${insCh.error.message}`);
      }

      // 8. Insert content blocks (new ids; metadata.appId remapped).
      if (blocks && blocks.length > 0) {
        const blockRows = blocks.map((b) => ({
          id: blockIdMap.get(b.id) as string,
          course_id: newCourseId,
          chapter_id: b.chapter_id ? (chapterIdMap.get(b.chapter_id) ?? null) : null,
          version_id: newVersionId,
          block_type: b.block_type,
          order_index: b.order_index,
          content_hash: b.content_hash,
          visibility: b.visibility,
          source_range: b.source_range,
          metadata: remapBlockMetadataDemoId(b.metadata, demoIdMap),
        }));
        const insBlocks = await svc.from('content_blocks').insert(blockRows);
        if (insBlocks.error) throw new Error(`블록 복사 실패: ${insBlocks.error.message}`);
      }

      // 9. Optionally copy PUBLISHED lecture sessions + their annotations.
      //    created_against_hash is PRESERVED so drift detection stays valid.
      if (input.copyPublishedAnnotations) {
        const { data: sessions, error: sErr } = await svc
          .from('lecture_sessions')
          .select('*')
          .eq('course_id', sourceCourseId)
          .eq('published', true);
        if (sErr) throw new Error(`세션 조회 실패: ${sErr.message}`);

        for (const s of sessions ?? []) {
          const newChId = chapterIdMap.get(s.chapter_id);
          if (!newChId) continue; // session for an uncopied chapter — skip
          const newSessionId = randomUUID();
          const insS = await svc.from('lecture_sessions').insert({
            id: newSessionId,
            course_id: newCourseId,
            chapter_id: newChId,
            title: `${s.title} · ${label}`,
            status: s.status,
            published: true,
            created_by: user.id,
          });
          if (insS.error) throw new Error(`세션 복사 실패: ${insS.error.message}`);

          const { data: anns, error: aErr } = await svc
            .from('annotations')
            .select('*')
            .eq('lecture_session_id', s.id);
          if (aErr) throw new Error(`판서 조회 실패: ${aErr.message}`);
          if (anns && anns.length > 0) {
            const annRows = anns.map((a) => ({
              id: randomUUID(),
              course_id: newCourseId,
              chapter_id: chapterIdMap.get(a.chapter_id) ?? newChId,
              // Remap the anchor to the new block id; fall back to the old id
              // for an annotation whose block no longer exists (dangling, same
              // as an orphaned annotation would be in the source term).
              block_id: blockIdMap.get(a.block_id) ?? a.block_id,
              course_version_id: a.course_version_id ? newVersionId : null,
              lecture_session_id: newSessionId,
              author_id: a.author_id,
              annotation_type: a.annotation_type,
              coord_space: a.coord_space,
              created_against_hash: a.created_against_hash,
              data: a.data,
              style: a.style,
              scope: a.scope,
            }));
            const insA = await svc.from('annotations').insert(annRows);
            if (insA.error) throw new Error(`판서 복사 실패: ${insA.error.message}`);
          }
        }
      }

      const chapterSlug =
        (chapters ?? []).reduce<{ slug: string; order: number } | null>((acc, ch) => {
          if (!acc || ch.order_index < acc.order) return { slug: ch.slug, order: ch.order_index };
          return acc;
        }, null)?.slug ?? null;

      return { ok: true, data: { courseId: newCourseId, chapterSlug } };
    } catch (err) {
      // Compensating cleanup — cascades to every child table.
      await svc.from('courses').delete().eq('id', newCourseId);
      throw err;
    }
  } catch (err) {
    return fail(err);
  }
}
