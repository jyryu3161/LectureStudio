/**
 * Runtime Studio + code-execution domain types (MVP3, PRD §10).
 *
 * These mirror the DB shapes in supabase/migrations/0004_runtime.sql. The
 * generated `Database` type (lib/supabase/types.ts) types jsonb columns as
 * `Json` and text status columns as plain `string`, so this module is the
 * single source of truth for the narrowed unions and the package-list shape
 * that the Dockerfile generator, server actions, and worker all share.
 */

/** runtimes.status lifecycle. */
export const RUNTIME_STATUSES = ['draft', 'building', 'ready', 'failed'] as const;
export type RuntimeStatus = (typeof RUNTIME_STATUSES)[number];

/** runtime_builds.status lifecycle. */
export const BUILD_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;
export type BuildStatus = (typeof BUILD_STATUSES)[number];

/** executions.status lifecycle (timeout is distinct from a generic failure). */
export const EXECUTION_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'timeout',
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/**
 * The subset of a `runtimes` row that fully determines the generated
 * Dockerfile. Kept deliberately small and pure so generateDockerfile is
 * unit-testable without a DB round-trip.
 */
export interface RuntimeSpec {
  base_image: string;
  python_version: string;
  conda_packages: string[];
  pip_packages: string[];
  apt_packages: string[];
}

/** Full runtime recipe as stored, used by the worker + server actions. */
export interface Runtime extends RuntimeSpec {
  id: string;
  course_id: string | null;
  name: string;
  dockerfile: string | null;
  image_tag: string | null;
  gpu_enabled: boolean;
  memory_limit: string;
  timeout_seconds: number;
  status: RuntimeStatus;
}

/** Config accepted by createRuntime / updateRuntime server actions. */
export interface RuntimeConfigInput {
  name: string;
  python_version?: string;
  base_image?: string;
  conda_packages?: string[];
  pip_packages?: string[];
  apt_packages?: string[];
  gpu_enabled?: boolean;
  memory_limit?: string;
  timeout_seconds?: number;
}

/** Input to queueExecution (block + code snapshot to run). */
export interface QueueExecutionInput {
  chapterId: string;
  blockId: string;
  code: string;
  /** Optional explicit runtime; otherwise resolved from block metadata / a ready course runtime. */
  runtimeId?: string;
}

/** Hard cap on captured stdout/stderr per execution (PRD §10.5). 64 KiB. */
export const OUTPUT_CAP_BYTES = 64 * 1024;
