/**
 * Runtime Studio data access + authorization — SERVER ONLY (imports
 * next/headers via lib/supabase/server; never import from a Client Component).
 *
 * This is the authz gate for MVP3 (PRD §10.5):
 *   - createRuntime / updateRuntime / queueBuild are app_admin-only (checked
 *     in code AND enforced again by RLS on runtimes / runtime_builds).
 *   - queueExecution is the SECURITY-CRITICAL entry point: it may only queue a
 *     run when the caller has an elevated course role (author/instructor/admin)
 *     AND the target block is server-verified executable
 *     (content_blocks.metadata.executable === true) — never trusting a client
 *     claim. The insert additionally rides RLS (executed_by pinned to
 *     auth.uid(), membership re-checked) so a student can't queue anything.
 *
 * All reads/writes here use the RLS-applying request client, so this layer is
 * defense-in-depth on top of the policies, not a bypass. The worker is the
 * only service-role path (worker/*), and it lives out of process.
 */
import { canRunCode, isElevatedRunRole } from '@/lib/auth/guards';
import { getCurrentUser, getCourseRole } from '@/lib/auth/session';
import type { CourseRole } from '@/lib/supabase/roles';
import { createClient } from '@/lib/supabase/server';

import { generateDockerfile } from './dockerfile';
import type {
  BuildStatus,
  ExecutionStatus,
  RuntimeConfigInput,
  RuntimeStatus,
  QueueExecutionInput,
} from './types';

/** Max in-flight (queued|running) runs a student may hold at once (PRD §10.5 opt-in). */
const STUDENT_INFLIGHT_LIMIT = 1;
/** Higher ceiling for elevated roles (mirrors the executions_rate_limit trigger, migration 0008). */
const ELEVATED_INFLIGHT_LIMIT = 3;

/**
 * Guard against Dockerfile/shell injection via package names. Conda/pip/apt
 * tokens may only contain package-name + version-spec characters — no spaces,
 * quotes, backticks, `$`, `;`, `&`, newlines, etc. Rejects the whole request
 * on the first bad token (fail closed).
 */
const SAFE_PKG = /^[A-Za-z0-9][A-Za-z0-9._+\-<>=!~[\]]*$/;
function validatePackages(label: string, pkgs: string[] | undefined): string[] {
  if (!pkgs) return [];
  for (const p of pkgs) {
    if (typeof p !== 'string' || !SAFE_PKG.test(p.trim())) {
      throw new Error(`Invalid ${label} package name: ${JSON.stringify(p)}`);
    }
  }
  return pkgs.map((p) => p.trim()).filter(Boolean);
}

async function requireAppAdmin(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('You must be signed in.');
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('app_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    throw new Error(`Runtime: admin check failed: ${error.message}`);
  }
  if (!data) {
    throw new Error('Only a platform admin can manage runtimes.');
  }
  return user.id;
}

export interface RuntimeRow {
  id: string;
  course_id: string | null;
  name: string;
  python_version: string;
  base_image: string;
  conda_packages: string[];
  pip_packages: string[];
  apt_packages: string[];
  dockerfile: string | null;
  image_tag: string | null;
  gpu_enabled: boolean;
  memory_limit: string;
  timeout_seconds: number;
  status: RuntimeStatus;
}

export interface BuildRow {
  id: string;
  runtime_id: string;
  status: BuildStatus;
  log: string;
  image_tag: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface ExecutionRow {
  id: string;
  course_id: string | null;
  chapter_id: string | null;
  block_id: string | null;
  runtime_id: string | null;
  code: string;
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number | null;
  executed_by: string;
  created_at: string;
  finished_at: string | null;
}

/** Build the DB-column payload for a runtime recipe (also (re)generates the Dockerfile preview). */
function toRuntimeColumns(config: RuntimeConfigInput) {
  const conda = validatePackages('conda', config.conda_packages);
  const pip = validatePackages('pip', config.pip_packages);
  const apt = validatePackages('apt', config.apt_packages);
  const python_version = (config.python_version ?? '3.11').trim();
  const base_image = (config.base_image ?? 'mambaorg/micromamba:1.5-jammy').trim();
  const dockerfile = generateDockerfile({
    base_image,
    python_version,
    conda_packages: conda,
    pip_packages: pip,
    apt_packages: apt,
  });
  return {
    name: config.name.trim(),
    python_version,
    base_image,
    conda_packages: conda,
    pip_packages: pip,
    apt_packages: apt,
    gpu_enabled: config.gpu_enabled ?? false,
    memory_limit: (config.memory_limit ?? '512m').trim(),
    timeout_seconds: config.timeout_seconds ?? 30,
    dockerfile,
  };
}

/** Create a new (draft) runtime for a course. Admin-only. */
export async function createRuntime(
  courseId: string,
  config: RuntimeConfigInput,
): Promise<RuntimeRow> {
  await requireAppAdmin();
  if (!config.name?.trim()) {
    throw new Error('Runtime name is required.');
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('runtimes')
    .insert({ course_id: courseId, status: 'draft', ...toRuntimeColumns(config) })
    .select('*')
    .single();
  if (error) {
    throw new Error(`Failed to create runtime: ${error.message}`);
  }
  return data as unknown as RuntimeRow;
}

/** Update a runtime's recipe (resets it to draft; a rebuild is required). Admin-only. */
export async function updateRuntime(
  runtimeId: string,
  config: RuntimeConfigInput,
): Promise<RuntimeRow> {
  await requireAppAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('runtimes')
    .update({ status: 'draft', image_tag: null, ...toRuntimeColumns(config) })
    .eq('id', runtimeId)
    .select('*')
    .single();
  if (error) {
    throw new Error(`Failed to update runtime: ${error.message}`);
  }
  return data as unknown as RuntimeRow;
}

/** Queue a build for a runtime and flip it to 'building'. Admin-only. Returns the build id. */
export async function queueBuild(runtimeId: string): Promise<string> {
  await requireAppAdmin();
  const supabase = await createClient();

  const { data: build, error: buildError } = await supabase
    .from('runtime_builds')
    .insert({ runtime_id: runtimeId, status: 'queued' })
    .select('id')
    .single();
  if (buildError) {
    throw new Error(`Failed to queue build: ${buildError.message}`);
  }

  const { error: rtError } = await supabase
    .from('runtimes')
    .update({ status: 'building' })
    .eq('id', runtimeId);
  if (rtError) {
    throw new Error(`Failed to mark runtime building: ${rtError.message}`);
  }

  return (build as { id: string }).id;
}

/** Fetch a single build (RLS: elevated course members / admins only). */
export async function getBuild(buildId: string): Promise<BuildRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('runtime_builds')
    .select('*')
    .eq('id', buildId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load build: ${error.message}`);
  }
  return (data as unknown as BuildRow) ?? null;
}

/**
 * Queue a code execution for a block. THE authorization gate for running code
 * (PRD §10.5):
 *   1. caller must be signed in;
 *   2. the block must exist and belong to `chapterId`;
 *   3. the block must be server-verified executable (metadata.executable === true);
 *   4. caller must hold an elevated role on the block's course;
 *   5. a 'ready' runtime (explicit, or from block metadata, or the course's
 *      most recent ready one) must exist — we never queue against an image
 *      that doesn't exist yet.
 * Returns the execution id for polling via getExecution.
 */
export async function queueExecution(input: QueueExecutionInput): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('You must be signed in to run code.');
  }
  const supabase = await createClient();

  // (2) Load the block through RLS. Also gives us the authoritative course_id.
  const { data: block, error: blockError } = await supabase
    .from('content_blocks')
    .select('id, course_id, chapter_id, block_type, metadata')
    .eq('id', input.blockId)
    .maybeSingle();
  if (blockError) {
    throw new Error(`Failed to load block: ${blockError.message}`);
  }
  if (!block) {
    throw new Error('Block not found.');
  }
  if (block.chapter_id !== input.chapterId) {
    throw new Error('Block does not belong to the given chapter.');
  }

  // (3) Server-verified executability — never trust a client-supplied flag.
  const metadata = (block.metadata ?? {}) as Record<string, unknown>;
  if (metadata.executable !== true) {
    throw new Error('This block is not marked executable.');
  }
  const courseId = block.course_id;
  if (!courseId) {
    throw new Error('Block is not associated with a course.');
  }

  // (4) Effective run gate (PRD §10.5): elevated role, OR an opt-in student on
  //     a course that has enabled student execution. Re-checked here server-side
  //     and again by the executions_insert RLS policy (migration 0008).
  const role = await getCourseRole(courseId);
  let studentExecutionEnabled = false;
  if (role === 'student') {
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('student_execution_enabled')
      .eq('id', courseId)
      .maybeSingle();
    if (courseError) {
      throw new Error(`Failed to load course settings: ${courseError.message}`);
    }
    studentExecutionEnabled = course?.student_execution_enabled === true;
  }
  if (!canRunCode({ role, blockExecutable: true, studentExecutionEnabled })) {
    throw new Error('Only an author, instructor, or admin can run code.');
  }

  // (4b) Rate limit: a student may hold at most ONE in-flight run; elevated
  //      roles get a higher ceiling. Enforced here (clean Korean error) and, as
  //      defense-in-depth, by the executions_rate_limit trigger (migration 0008).
  const inFlightLimit = isElevatedRunRole(role)
    ? ELEVATED_INFLIGHT_LIMIT
    : STUDENT_INFLIGHT_LIMIT;
  const { count: inFlightCount, error: countError } = await supabase
    .from('executions')
    .select('id', { count: 'exact', head: true })
    .eq('executed_by', user.id)
    .in('status', ['queued', 'running']);
  if (countError) {
    throw new Error(`Failed to check running executions: ${countError.message}`);
  }
  if ((inFlightCount ?? 0) >= inFlightLimit) {
    throw new Error('이전 코드 실행이 끝난 뒤 다시 실행하세요.');
  }

  // (5) Resolve a READY runtime with an image to run against.
  const metaRuntimeId =
    typeof metadata.runtimeId === 'string' ? metadata.runtimeId : undefined;
  const runtimeId = input.runtimeId ?? metaRuntimeId;

  let runtimeQuery = supabase
    .from('runtimes')
    .select('id, status, image_tag')
    .eq('course_id', courseId)
    .eq('status', 'ready');
  if (runtimeId) {
    runtimeQuery = runtimeQuery.eq('id', runtimeId);
  }
  const { data: runtimes, error: rtError } = await runtimeQuery
    .order('updated_at', { ascending: false })
    .limit(1);
  if (rtError) {
    throw new Error(`Failed to resolve runtime: ${rtError.message}`);
  }
  const runtime = runtimes?.[0] as { id: string; image_tag: string | null } | undefined;
  if (!runtime || !runtime.image_tag) {
    throw new Error('No ready runtime is available for this course. Build one first.');
  }

  // Insert the audit row. RLS with-check re-pins executed_by = auth.uid() and
  // re-verifies elevated membership — a student's insert matches zero rows.
  const { data: execution, error: execError } = await supabase
    .from('executions')
    .insert({
      course_id: courseId,
      chapter_id: input.chapterId,
      block_id: input.blockId,
      runtime_id: runtime.id,
      code: input.code,
      status: 'queued',
      executed_by: user.id,
    })
    .select('id')
    .single();
  if (execError) {
    throw new Error(`Failed to queue execution: ${execError.message}`);
  }
  return (execution as { id: string }).id;
}

/** Fetch a single execution for polling (RLS: only the executor or an admin). */
export async function getExecution(executionId: string): Promise<ExecutionRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('executions')
    .select('*')
    .eq('id', executionId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load execution: ${error.message}`);
  }
  return (data as unknown as ExecutionRow) ?? null;
}
