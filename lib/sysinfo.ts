/**
 * Host resource detection for auto-tuning the worker's sandbox limits.
 *
 * SERVER / NODE ONLY — never import this from a Client Component or RSC that
 * ships to the browser. It reads `node:os` and the Linux cgroup pseudo-files,
 * neither of which exists in the browser. The worker (out-of-process, run via
 * `npx jiti worker/index.ts`) and scripts/install.sh's node one-liner are the
 * intended callers.
 *
 * Why cgroups matter: `os.totalmem()` / `os.cpus().length` report the HOST's
 * hardware even when this process runs INSIDE a container with a smaller quota
 * (`docker run --memory 2g --cpus 2`). Tuning to the host would over-commit and
 * get us OOM-killed. So when a cgroup limit is present and smaller than the
 * host, it wins. On a bare host (no container quota) the os values are used.
 *
 * The pure math lives in computeWorkerTuning (lib/runtime-tuning.ts); this file
 * only gathers raw facts. detectHostResources() does a little I/O (cgroup files
 * + a `docker version` probe); readCgroupLimits() is pure-ish (fs reads) and
 * unit-testable by pointing it at a fixture root.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as os from 'node:os';

const MB = 1024 * 1024;

export type CgroupVersion = 'v1' | 'v2' | 'none';

export interface CgroupLimits {
  /** cgroup memory hard limit in bytes, if a finite quota is set (else undefined). */
  memLimitBytes?: number;
  /** cgroup current memory usage in bytes, if readable (else undefined). */
  memCurrentBytes?: number;
  /** Effective CPU count from a cpu quota (quota/period), if set (else undefined). */
  cpuQuota?: number;
  version: CgroupVersion;
}

export interface HostResources {
  /** Effective usable CPU count (host cores, capped by any cgroup cpu quota). */
  cpus: number;
  /** Total memory in MB (host RAM, capped by any cgroup memory limit). */
  totalMemMB: number;
  /** Currently-available memory in MB (free host RAM, or cgroup limit − usage). */
  availMemMB: number;
  /** Whether a working `docker` CLI + daemon were detected. */
  dockerAvailable: boolean;
  /** Which cgroup hierarchy (if any) supplied the container quota. */
  cgroupVersion: CgroupVersion;
}

/**
 * Read container memory/cpu quotas from the cgroup filesystem.
 *
 * cgroup v2 (unified): `<root>/memory.max` ("max" = unlimited), `memory.current`,
 * `cpu.max` ("<quota> <period>" or "max <period>").
 * cgroup v1 (legacy): `<root>/memory/memory.limit_in_bytes` (a huge sentinel
 * ≈ PAGE_COUNTER_MAX means unlimited), `memory.usage_in_bytes`,
 * `cpu,cpuacct/cpu.cfs_quota_us` + `cpu.cfs_period_us` (quota −1 = unlimited).
 *
 * `root` is injectable so tests can point at a fixture tree. A limit is only
 * reported when it is finite AND below a sane ceiling (guards against the v1
 * "unlimited" sentinel and absurd values).
 */
export function readCgroupLimits(root = '/sys/fs/cgroup'): CgroupLimits {
  // A v1 "unlimited" memory limit is a near-INT64 sentinel; treat anything
  // above ~8 PiB as "no real limit".
  const UNLIMITED_CEIL = 8 * 1024 * 1024 * 1024 * 1024 * 1024;

  const readNum = (path: string): number | undefined => {
    try {
      if (!existsSync(path)) return undefined;
      const raw = readFileSync(path, 'utf8').trim();
      if (raw === '' || raw === 'max') return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    } catch {
      return undefined;
    }
  };

  // --- cgroup v2 (unified hierarchy) ---
  if (existsSync(`${root}/cgroup.controllers`) || existsSync(`${root}/memory.max`)) {
    const out: CgroupLimits = { version: 'v2' };
    const memMax = readNum(`${root}/memory.max`);
    if (memMax !== undefined && memMax < UNLIMITED_CEIL) out.memLimitBytes = memMax;
    const memCurrent = readNum(`${root}/memory.current`);
    if (memCurrent !== undefined) out.memCurrentBytes = memCurrent;

    // cpu.max: "<quota> <period>" microseconds, or "max <period>" for none.
    try {
      const cpuMaxPath = `${root}/cpu.max`;
      if (existsSync(cpuMaxPath)) {
        const [quotaStr, periodStr] = readFileSync(cpuMaxPath, 'utf8').trim().split(/\s+/);
        const quota = Number(quotaStr);
        const period = Number(periodStr);
        if (quotaStr !== 'max' && Number.isFinite(quota) && quota > 0 && period > 0) {
          out.cpuQuota = quota / period;
        }
      }
    } catch {
      /* ignore */
    }
    // If v2 root exposes no real limits (host root cgroup), still report v2 so
    // callers know the hierarchy; the undefined limits mean "fall back to os".
    return out;
  }

  // --- cgroup v1 (legacy, split controllers) ---
  const memLimitPath = `${root}/memory/memory.limit_in_bytes`;
  if (existsSync(memLimitPath)) {
    const out: CgroupLimits = { version: 'v1' };
    const memLimit = readNum(memLimitPath);
    if (memLimit !== undefined && memLimit < UNLIMITED_CEIL) out.memLimitBytes = memLimit;
    const memUsage = readNum(`${root}/memory/memory.usage_in_bytes`);
    if (memUsage !== undefined) out.memCurrentBytes = memUsage;

    const quota = readNum(`${root}/cpu,cpuacct/cpu.cfs_quota_us`);
    const period = readNum(`${root}/cpu,cpuacct/cpu.cfs_period_us`);
    if (quota !== undefined && quota > 0 && period !== undefined && period > 0) {
      out.cpuQuota = quota / period;
    }
    return out;
  }

  return { version: 'none' };
}

/** Best-effort check that the `docker` CLI and its daemon are reachable. */
export function detectDocker(): boolean {
  try {
    const res = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return res.status === 0 && typeof res.stdout === 'string' && res.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Gather effective host resources, honouring container cgroup quotas when they
 * are smaller than the physical host. Pure os values are used on a bare host.
 *
 * `opts.cgroupRoot` / `opts.probeDocker` are injectable for tests.
 */
export function detectHostResources(
  opts: {
    cgroupRoot?: string;
    probeDocker?: boolean;
  } = {},
): HostResources {
  const cg = readCgroupLimits(opts.cgroupRoot ?? '/sys/fs/cgroup');

  const hostCpus = Math.max(1, os.cpus().length);
  const cpus =
    cg.cpuQuota !== undefined ? Math.max(1, Math.min(hostCpus, Math.ceil(cg.cpuQuota))) : hostCpus;

  const hostTotalMB = Math.floor(os.totalmem() / MB);
  const hostFreeMB = Math.floor(os.freemem() / MB);

  let totalMemMB = hostTotalMB;
  let availMemMB = hostFreeMB;
  if (cg.memLimitBytes !== undefined) {
    const limitMB = Math.floor(cg.memLimitBytes / MB);
    // The container quota caps total; never report more than the host actually has.
    totalMemMB = Math.min(hostTotalMB, limitMB);
    // Available within the container = limit − current usage (fall back to host free).
    if (cg.memCurrentBytes !== undefined) {
      availMemMB = Math.max(0, totalMemMB - Math.floor(cg.memCurrentBytes / MB));
    } else {
      availMemMB = Math.min(hostFreeMB, totalMemMB);
    }
  }

  return {
    cpus,
    totalMemMB,
    availMemMB,
    dockerAvailable: opts.probeDocker === false ? false : detectDocker(),
    cgroupVersion: cg.version,
  };
}
