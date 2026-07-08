/**
 * Unit tests for the host-aware auto-tuning policy (lib/runtime-tuning) and the
 * pure cgroup/parse helpers (lib/sysinfo). These exercise the FORMULA with
 * synthetic host inputs — no real machine, no docker, no DB — so they are
 * deterministic across CI and dev boxes.
 */
import { describe, expect, it } from 'vitest';

import {
  computeWorkerTuning,
  parseMemToMB,
  resolveJobLimits,
  type WorkerTuning,
} from '@/lib/runtime-tuning';
import type { HostResources } from '@/lib/sysinfo';

function host(partial: Partial<HostResources>): HostResources {
  return {
    cpus: 2,
    totalMemMB: 4096,
    availMemMB: 3000,
    dockerAvailable: true,
    cgroupVersion: 'none',
    ...partial,
  };
}

// No env overrides — force an empty env so a developer's shell can't leak in.
const NO_ENV: Record<string, string | undefined> = {};

describe('computeWorkerTuning', () => {
  it('tiny host (2 cpu / 2 GB) → concurrency 1, 256 MB jobs, 1 cpu', () => {
    const t = computeWorkerTuning(host({ cpus: 2, totalMemMB: 2048, availMemMB: 1500 }), NO_ENV);
    // reserve = max(1024, 0.4*2048=819) = 1024; usable = 1500-1024 = 476;
    // perJob = 256 (total < 4096); floor(476/256) = 1 → clamp(1,1,2) = 1.
    expect(t.maxConcurrentExecutions).toBe(1);
    expect(t.defaultJobMemMB).toBe(256);
    expect(t.defaultCpus).toBe(1);
    expect(t.maxConcurrentBuilds).toBe(1);
    expect(t.jobTimeoutSeconds).toBe(30);
    expect(t.reserveMB).toBe(1024);
  });

  it('this box shape (2 cpu / ~3.8 GB) → concurrency 1 (memory-bound, CPU-capped)', () => {
    const t = computeWorkerTuning(host({ cpus: 2, totalMemMB: 3834, availMemMB: 1749 }), NO_ENV);
    // reserve = max(1024, 1533) = 1533; usable = 1749-1533 = 216; perJob 256.
    expect(t.maxConcurrentExecutions).toBe(1);
    expect(t.defaultJobMemMB).toBe(256);
  });

  it('standard host (4 cpu / 8 GB) → CPU-capped concurrency, 512 MB jobs, 2 cpu', () => {
    const t = computeWorkerTuning(host({ cpus: 4, totalMemMB: 8192, availMemMB: 6500 }), NO_ENV);
    // reserve = max(1024, 3276) = 3276; usable = 6500-3276 = 3224;
    // perJob = 512; floor(3224/512) = 6 → clamp(6,1,4) = 4 (CPU cap).
    expect(t.maxConcurrentExecutions).toBe(4);
    expect(t.defaultJobMemMB).toBe(512);
    expect(t.defaultCpus).toBe(2);
    expect(t.maxConcurrentBuilds).toBe(1);
  });

  it('big host (16 cpu / 32 GB) → concurrency capped at cpus, builds bumped to 2', () => {
    const t = computeWorkerTuning(host({ cpus: 16, totalMemMB: 32768, availMemMB: 30000 }), NO_ENV);
    // reserve = max(1024, 13107) = 13107; usable = 16893; perJob 512;
    // floor(16893/512) = 32 → clamp to cpus 16.
    expect(t.maxConcurrentExecutions).toBe(16);
    expect(t.maxConcurrentBuilds).toBe(2);
    expect(t.defaultJobMemMB).toBe(512);
    expect(t.defaultCpus).toBe(2);
  });

  it('memory-starved host (8 cpu but only 2 GB free) → memory bound below cpu count', () => {
    const t = computeWorkerTuning(host({ cpus: 8, totalMemMB: 8192, availMemMB: 2000 }), NO_ENV);
    // reserve = max(1024, 3276) = 3276; usable = max(0, 2000-3276) = 0;
    // floor(0/512) = 0 → clamp to at least 1.
    expect(t.maxConcurrentExecutions).toBe(1);
  });

  it('env overrides win over auto and set the override flags', () => {
    const env: Record<string, string | undefined> = {
      WORKER_MAX_CONCURRENCY: '6',
      JOB_MEMORY_MB: '384',
      JOB_CPUS: '3',
      JOB_TIMEOUT_SECONDS: '90',
    };
    const t = computeWorkerTuning(host({ cpus: 2, totalMemMB: 2048, availMemMB: 1500 }), env);
    expect(t.maxConcurrentExecutions).toBe(6); // overrides the CPU cap
    expect(t.defaultJobMemMB).toBe(384);
    expect(t.defaultCpus).toBe(3);
    expect(t.jobTimeoutSeconds).toBe(90);
    expect(t.envOverrides).toEqual({
      maxConcurrency: true,
      jobMemMB: true,
      jobCpus: true,
      jobTimeoutSeconds: true,
    });
  });

  it('ignores invalid / non-positive env values (falls back to auto)', () => {
    const env: Record<string, string | undefined> = {
      WORKER_MAX_CONCURRENCY: 'abc',
      JOB_MEMORY_MB: '0',
      JOB_CPUS: '-2',
      JOB_TIMEOUT_SECONDS: '',
    };
    const t = computeWorkerTuning(host({ cpus: 4, totalMemMB: 8192, availMemMB: 6500 }), env);
    expect(t.maxConcurrentExecutions).toBe(4);
    expect(t.defaultJobMemMB).toBe(512);
    expect(t.defaultCpus).toBe(2);
    expect(t.jobTimeoutSeconds).toBe(30);
    expect(t.envOverrides.maxConcurrency).toBe(false);
  });

  it('always returns at least 1 for every ceiling, even on a degenerate host', () => {
    const t = computeWorkerTuning(host({ cpus: 1, totalMemMB: 512, availMemMB: 100 }), NO_ENV);
    expect(t.maxConcurrentExecutions).toBeGreaterThanOrEqual(1);
    expect(t.maxConcurrentBuilds).toBeGreaterThanOrEqual(1);
    expect(t.defaultCpus).toBeGreaterThanOrEqual(1);
    expect(t.defaultJobMemMB).toBeGreaterThanOrEqual(256);
  });
});

describe('parseMemToMB', () => {
  it('parses docker memory strings to MB', () => {
    expect(parseMemToMB('512m')).toBe(512);
    expect(parseMemToMB('1g')).toBe(1024);
    expect(parseMemToMB('2G')).toBe(2048);
    expect(parseMemToMB('256M')).toBe(256);
    expect(parseMemToMB('1048576k')).toBe(1024);
  });

  it('returns undefined for empty / unparseable input', () => {
    expect(parseMemToMB(null)).toBeUndefined();
    expect(parseMemToMB(undefined)).toBeUndefined();
    expect(parseMemToMB('')).toBeUndefined();
    expect(parseMemToMB('lots')).toBeUndefined();
  });
});

describe('resolveJobLimits (precedence: env > runtime row > auto)', () => {
  const tuning: WorkerTuning = {
    maxConcurrentExecutions: 2,
    maxConcurrentBuilds: 1,
    defaultJobMemMB: 512,
    defaultCpus: 2,
    jobTimeoutSeconds: 30,
    reserveMB: 1024,
    envOverrides: {
      maxConcurrency: false,
      jobMemMB: false,
      jobCpus: false,
      jobTimeoutSeconds: false,
    },
  };

  it('uses the auto default when neither env nor runtime row set a value', () => {
    const r = resolveJobLimits(tuning, {}, { memory_limit: null, timeout_seconds: null });
    expect(r).toEqual({ memory: '512m', cpus: '2', timeoutSeconds: 30 });
  });

  it('runtime row wins over the auto default', () => {
    const r = resolveJobLimits(tuning, {}, { memory_limit: '768m', timeout_seconds: 45 });
    expect(r.memory).toBe('768m');
    expect(r.timeoutSeconds).toBe(45);
  });

  it('env override wins over the runtime row', () => {
    const env: Record<string, string | undefined> = {
      JOB_MEMORY_MB: '300',
      JOB_TIMEOUT_SECONDS: '15',
    };
    const r = resolveJobLimits(tuning, env, { memory_limit: '768m', timeout_seconds: 45 });
    expect(r.memory).toBe('300m');
    expect(r.timeoutSeconds).toBe(15);
  });
});
