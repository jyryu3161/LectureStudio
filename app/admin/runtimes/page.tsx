import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  RuntimeList,
  type CourseOption,
  type RuntimeSummary,
} from '@/components/admin/runtime-list';
import { getCurrentUser } from '@/lib/auth/session';
import type { RuntimeStatus } from '@/lib/runtime/types';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Admin · 런타임 스튜디오 | Lecture Studio',
};

/**
 * Admin — Runtime Studio list (PRD §10.4).
 *
 * Server-gated on app_admins membership, identical to app/admin/page.tsx:
 * signed-out → login, signed-in non-admins → Reading. Reads (runtimes,
 * courses) go through the RLS-applying request client — the `runtimes_select`
 * policy already scopes visibility to elevated course members / platform
 * admins, so this list is defense-in-depth on top of the policy, not a bypass.
 * All mutations happen via the app_admin-gated Server Actions in lib/runtime.
 */
export default async function AdminRuntimesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/admin/runtimes');
  }

  const supabase = await createClient();
  const { data: adminRow, error: adminError } = await supabase
    .from('app_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminError) {
    throw new Error(`관리자 권한 확인에 실패했습니다: ${adminError.message}`);
  }
  if (!adminRow) {
    redirect('/reading');
  }

  const [{ data: runtimeRows, error: runtimesError }, { data: courseRows, error: coursesError }] =
    await Promise.all([
      supabase
        .from('runtimes')
        .select('id, name, course_id, python_version, status, image_tag')
        .order('created_at', { ascending: false }),
      supabase.from('courses').select('id, title').order('title', { ascending: true }),
    ]);

  if (runtimesError) {
    throw new Error(`런타임 목록을 불러오지 못했습니다: ${runtimesError.message}`);
  }
  if (coursesError) {
    throw new Error(`코스 목록을 불러오지 못했습니다: ${coursesError.message}`);
  }

  const courses: CourseOption[] = (courseRows ?? []).map((c) => ({ id: c.id, title: c.title }));
  const titleById = new Map(courses.map((c) => [c.id, c.title] as const));

  const runtimes: RuntimeSummary[] = (runtimeRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    courseTitle: r.course_id ? (titleById.get(r.course_id) ?? null) : null,
    pythonVersion: r.python_version,
    status: r.status as RuntimeStatus,
    imageTag: r.image_tag,
  }));

  return <RuntimeList runtimes={runtimes} courses={courses} />;
}
