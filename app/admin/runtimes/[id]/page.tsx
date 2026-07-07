import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import {
  RuntimeDetail,
  type BuildHistoryRow,
  type RuntimeDetailData,
} from '@/components/admin/runtime-detail';
import { getCurrentUser } from '@/lib/auth/session';
import type { BuildStatus, RuntimeStatus } from '@/lib/runtime/types';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Admin · 런타임 상세 | Lecture Studio',
};

/** Coerce a jsonb package column (typed as Json) into a clean string[]. */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/**
 * Admin — Runtime Studio detail/edit (PRD §10.4).
 *
 * Same app_admins gate as the list. Loads the runtime recipe + its build
 * history through RLS (runtimes_select / runtime_builds_select scope both to
 * elevated members / admins). Edits, Dockerfile regeneration, and build
 * queueing all run through the app_admin-gated Server Actions in lib/runtime;
 * this page only supplies the read model.
 */
export default async function AdminRuntimeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/admin/runtimes/${id}`);
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

  const { data: runtimeRow, error: runtimeError } = await supabase
    .from('runtimes')
    .select(
      'id, name, course_id, python_version, base_image, conda_packages, pip_packages, apt_packages, memory_limit, timeout_seconds, status, image_tag',
    )
    .eq('id', id)
    .maybeSingle();
  if (runtimeError) {
    throw new Error(`런타임을 불러오지 못했습니다: ${runtimeError.message}`);
  }
  if (!runtimeRow) {
    notFound();
  }

  const [{ data: courseRow }, { data: buildRows, error: buildsError }] = await Promise.all([
    runtimeRow.course_id
      ? supabase.from('courses').select('title').eq('id', runtimeRow.course_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('runtime_builds')
      .select('id, status, log, image_tag, created_at, finished_at')
      .eq('runtime_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (buildsError) {
    throw new Error(`빌드 히스토리를 불러오지 못했습니다: ${buildsError.message}`);
  }

  const runtime: RuntimeDetailData = {
    id: runtimeRow.id,
    name: runtimeRow.name,
    courseTitle: (courseRow as { title: string } | null)?.title ?? null,
    pythonVersion: runtimeRow.python_version,
    condaPackages: toStringList(runtimeRow.conda_packages),
    pipPackages: toStringList(runtimeRow.pip_packages),
    aptPackages: toStringList(runtimeRow.apt_packages),
    baseImage: runtimeRow.base_image,
    memoryLimit: runtimeRow.memory_limit,
    timeoutSeconds: runtimeRow.timeout_seconds,
    status: runtimeRow.status as RuntimeStatus,
    imageTag: runtimeRow.image_tag,
  };

  const builds: BuildHistoryRow[] = (buildRows ?? []).map((b) => ({
    id: b.id,
    status: b.status as BuildStatus,
    log: b.log,
    imageTag: b.image_tag,
    createdAt: b.created_at,
    finishedAt: b.finished_at,
  }));

  return <RuntimeDetail runtime={runtime} builds={builds} />;
}
