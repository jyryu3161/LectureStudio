/**
 * Host-aware auto-tuning policy for the worker's sandbox limits.
 *
 * The worker used to hardcode `--memory 512m --cpus 1` and run ONE job at a
 * time regardless of the machine. This module turns detected host resources
 * (lib/sysinfo.ts) into concrete numbers so the SAME build installs and runs
 * well on a 2 vCPU / 4 GB box and a 16 vCPU / 32 GB box alike.
 *
 * Everything here is PURE (host + env in → tuning out) so it is fully
 * unit-testable with synthetic inputs. Only the security-irrelevant NUMBERS
 * (concurrency, per-job memory/cpu, timeout) are tuned — every sandbox security
 * flag (--network none, non-root, --pids-limit, --rm) stays fixed in the worker.
 *
 * ─── Precedence (highest wins) ───────────────────────────────────────────────
 *   1. Explicit env override         (WORKER_MAX_CONCURRENCY, JOB_MEMORY_MB, …)
 *   2. Per-runtime row value         (runtimes.memory_limit / timeout_seconds)
 *   3. Auto-tuned default            (this module, from host resources)
 * The global tuning object below resolves env-over-auto. Per-runtime-row
 * precedence is applied at the job site by resolveJobLimits().
 */
import type { HostResources } from './sysinfo';

export interface WorkerTuning {
  /** Max execution (code-run) jobs to run concurrently. */
  maxConcurrentExecutions: number;
  /** Max heavy build jobs (docker build + marimo export) to run concurrently. */
  maxConcurrentBuilds: number;
  /** Per-job docker `--memory` / `--memory-swap` in MB. */
  defaultJobMemMB: number;
  /** Per-job docker `--cpus`. */
  defaultCpus: number;
  /** Per-execution wall-clock timeout in seconds. */
  jobTimeoutSeconds: number;
  /** Memory (MB) held back for Next + Supabase + worker + Docker daemon itself. */
  reserveMB: number;
  /** True when the corresponding env var explicitly overrode the auto value. */
  envOverrides: {
    maxConcurrency: boolean;
    jobMemMB: boolean;
    jobCpus: boolean;
    jobTimeoutSeconds: boolean;
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Parse a positive integer env var; returns undefined when unset/invalid. */
function envInt(env: Record<string, string | undefined>, key: string): number | undefined {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/**
 * Compute worker tuning from host resources.
 *
 * ─── Formula ─────────────────────────────────────────────────────────────────
 *   reserveMB   = max(1024, floor(totalMemMB * 0.40))
 *       → keep at least 1 GB (or 40% of RAM, whichever is larger) for Next,
 *         Supabase (Postgres/Kong/…), the Node worker, and the Docker daemon.
 *   perJobMemMB = clamp(totalMemMB >= 4096 ? 512 : 256, 256, 1024)   (auto)
 *       → 256 MB floor keeps a Python sandbox usable; 1 GB cap stops one job
 *         from eating the box. Bigger hosts get the historical 512 MB default.
 *   usableMB    = max(0, availMemMB - reserveMB)
 *   maxExec     = clamp(floor(usableMB / perJobMemMB), 1, cpus)
 *       → memory is the primary bound; never exceed the CPU count; always ≥ 1.
 *   maxBuilds   = (cpus >= 8 && totalMemMB >= 16384) ? 2 : 1
 *       → builds are heavy (docker build / pip). One by default; 2 only on
 *         genuinely large hosts.
 *   perJobCpus  = min(cpus, cpus >= 4 ? 2 : 1)   (auto)
 *   timeout     = 30s   (auto)
 *
 * env overrides win over every auto value:
 *   WORKER_MAX_CONCURRENCY → maxConcurrentExecutions (still clamped ≥ 1)
 *   JOB_MEMORY_MB          → defaultJobMemMB (min 64)
 *   JOB_CPUS              → defaultCpus (min 1)
 *   JOB_TIMEOUT_SECONDS    → jobTimeoutSeconds (min 1)
 */
export function computeWorkerTuning(
  host: HostResources,
  env: Record<string, string | undefined> = process.env,
): WorkerTuning {
  const cpus = Math.max(1, Math.floor(host.cpus));
  const totalMemMB = Math.max(0, Math.floor(host.totalMemMB));
  const availMemMB = Math.max(0, Math.floor(host.availMemMB));

  const reserveMB = Math.max(1024, Math.floor(totalMemMB * 0.4));

  // Per-job memory (auto), then env override.
  const envJobMem = envInt(env, 'JOB_MEMORY_MB');
  const autoJobMemMB = clamp(totalMemMB >= 4096 ? 512 : 256, 256, 1024);
  const defaultJobMemMB = envJobMem !== undefined ? Math.max(64, envJobMem) : autoJobMemMB;

  // Execution concurrency: memory-bound, CPU-capped, floored at 1.
  const usableMB = Math.max(0, availMemMB - reserveMB);
  const autoMaxExec = clamp(Math.floor(usableMB / defaultJobMemMB), 1, cpus);
  const envMaxConc = envInt(env, 'WORKER_MAX_CONCURRENCY');
  const maxConcurrentExecutions = envMaxConc !== undefined ? Math.max(1, envMaxConc) : autoMaxExec;

  // Builds are heavy; 1 by default, 2 only on large hosts.
  const maxConcurrentBuilds = cpus >= 8 && totalMemMB >= 16384 ? 2 : 1;

  // Per-job cpus (auto), then env override.
  const envJobCpus = envInt(env, 'JOB_CPUS');
  const autoCpus = Math.min(cpus, cpus >= 4 ? 2 : 1);
  const defaultCpus = envJobCpus !== undefined ? Math.max(1, envJobCpus) : autoCpus;

  // Timeout (auto 30s), then env override.
  const envTimeout = envInt(env, 'JOB_TIMEOUT_SECONDS');
  const jobTimeoutSeconds = envTimeout !== undefined ? Math.max(1, envTimeout) : 30;

  return {
    maxConcurrentExecutions,
    maxConcurrentBuilds,
    defaultJobMemMB,
    defaultCpus,
    jobTimeoutSeconds,
    reserveMB,
    envOverrides: {
      maxConcurrency: envMaxConc !== undefined,
      jobMemMB: envJobMem !== undefined,
      jobCpus: envJobCpus !== undefined,
      jobTimeoutSeconds: envTimeout !== undefined,
    },
  };
}

/** Parse a docker memory string ('512m', '1g', '2048') to MB; undefined if unparseable. */
export function parseMemToMB(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const m = value
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*([kmg]?)b?$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  switch (m[2]) {
    case 'g':
      return Math.round(n * 1024);
    case 'k':
      return Math.max(1, Math.round(n / 1024));
    case 'm':
      return Math.round(n);
    default:
      // Bare number → bytes.
      return Math.max(1, Math.round(n / (1024 * 1024)));
  }
}

export interface ResolvedJobLimits {
  /** docker `--memory` / `--memory-swap` value, e.g. "512m". */
  memory: string;
  /** docker `--cpus` value as a string, e.g. "1". */
  cpus: string;
  /** wall-clock timeout in seconds. */
  timeoutSeconds: number;
}

/**
 * Resolve the effective per-execution limits, applying full precedence:
 *   env override  >  per-runtime row  >  auto-tuned default.
 *
 * `runtime` carries the optional per-runtime memory_limit / timeout_seconds
 * (runtimes table). CPU has no per-runtime column, so it is env-over-auto only.
 */
export function resolveJobLimits(
  tuning: WorkerTuning,
  env: Record<string, string | undefined>,
  runtime: { memory_limit?: string | null; timeout_seconds?: number | null },
): ResolvedJobLimits {
  // Memory: env (MB) > runtime row > auto default.
  const envMemMB = envInt(env, 'JOB_MEMORY_MB');
  const rowMemMB = parseMemToMB(runtime.memory_limit);
  const memMB = envMemMB ?? rowMemMB ?? tuning.defaultJobMemMB;

  // CPUs: env > auto (no per-runtime column).
  const cpus = tuning.defaultCpus;

  // Timeout: env > runtime row > auto default.
  const envTimeout = envInt(env, 'JOB_TIMEOUT_SECONDS');
  const rowTimeout =
    runtime.timeout_seconds && runtime.timeout_seconds > 0 ? runtime.timeout_seconds : undefined;
  const timeoutSeconds = envTimeout ?? rowTimeout ?? tuning.jobTimeoutSeconds;

  return { memory: `${memMB}m`, cpus: String(cpus), timeoutSeconds };
}

/** One-line human banner for the worker startup log. */
export function tuningBanner(host: HostResources, tuning: WorkerTuning): string {
  const cg = host.cgroupVersion === 'none' ? '' : ` [cgroup ${host.cgroupVersion}]`;
  const docker = host.dockerAvailable ? 'docker ok' : 'docker MISSING';
  return (
    `[worker] host: ${host.cpus} cpus / ${host.totalMemMB} MB` +
    ` (avail ${host.availMemMB} MB, reserve ${tuning.reserveMB} MB)${cg}; ${docker}; ` +
    `concurrency=${tuning.maxConcurrentExecutions} builds=${tuning.maxConcurrentBuilds} ` +
    `job=${tuning.defaultJobMemMB}MB/${tuning.defaultCpus}cpu timeout=${tuning.jobTimeoutSeconds}s`
  );
}
