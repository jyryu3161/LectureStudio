# Sizing Proposal — Lecture Studio

How Lecture Studio picks its resource limits, and what to expect on different
servers. The platform **auto-tunes** the worker's sandbox limits to the host it
runs on instead of hardcoding `512m / 1 cpu / one-job-at-a-time`. Every number
below comes from the formula in [`lib/runtime-tuning.ts`](../lib/runtime-tuning.ts),
fed by host detection in [`lib/sysinfo.ts`](../lib/sysinfo.ts).

Preview what any box will adopt:

```bash
npm run tuning        # prints detected host resources + the tuning
```

---

## The three moving parts (and what each needs)

| Component | Role | Resource profile |
| --- | --- | --- |
| **Next.js app** | RSC + Server Actions UI | ~0.5–1 GB RSS; CPU spikes on build/SSR. Stateless — scales horizontally. |
| **Supabase** | Postgres + Auth + Storage (Kong, GoTrue, …) | ~1–2 GB for the local stack; hosted = offloaded entirely. |
| **Worker + Docker daemon** | Poll loop that launches sandboxed containers for code execution + image/marimo builds | The heavy tenant. Each **execution** container = `defaultJobMemMB`; each **build** is docker-build/pip heavy. This is what auto-tuning governs. |

The worker reserves headroom for the first two (and itself) so it never
over-commits: `reserveMB = max(1024, 40% of total RAM)`.

---

## The auto-tuning formula

Given detected host resources `{ cpus, totalMemMB, availMemMB }`
(`availMemMB` is measured **live** at worker startup, and honours a container's
cgroup memory/cpu quota when running inside one):

```
reserveMB    = max(1024, floor(totalMemMB * 0.40))          # Next + Supabase + worker + daemon
perJobMemMB  = clamp(totalMemMB >= 4096 ? 512 : 256, 256, 1024)
usableMB     = max(0, availMemMB - reserveMB)
maxExec      = clamp(floor(usableMB / perJobMemMB), 1, cpus) # memory-bound, CPU-capped, ≥1
maxBuilds    = (cpus >= 8 && totalMemMB >= 16384) ? 2 : 1    # builds are heavy → usually 1
perJobCpus   = min(cpus, cpus >= 4 ? 2 : 1)
timeout      = 30s
```

**Memory is the primary bound; CPU is the ceiling.** Concurrency is never
below 1 and never above the core count. `availMemMB` being live means a worker
sharing a box with Next + Supabase automatically claims *less* concurrency than
one on a dedicated Docker host — no config change needed.

**Env overrides win over auto** (highest precedence): `WORKER_MAX_CONCURRENCY`,
`JOB_MEMORY_MB`, `JOB_CPUS`, `JOB_TIMEOUT_SECONDS`.

**Per-execution precedence** (in [`resolveJobLimits`](../lib/runtime-tuning.ts)):
`env override  >  per-runtime row (runtimes.memory_limit / timeout_seconds)  >  auto default`.

---

## Server tiers

Numbers below are produced by the formula above. `maxExec` is shown for a
**dedicated** worker host (worker has most of the RAM) and, in parentheses, when
**colocated** with Next + a local Supabase (much less free RAM). This is the
same box on which `npm run tuning` was verified to yield **concurrency 1**
(2 vCPU / 3.8 GB, ~1.7 GB free while the app + DB run).

| Tier | cpus | RAM | reserve | perJob | maxExec (dedicated / colocated) | maxBuilds | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Minimal** | 2 | 4 GB | 1638 MB | 512 MB / 1 cpu | **2** / 1 | 1 | Demo / single-classroom. Runs, but one heavy build starves execution. |
| **Standard** | 4 | 8 GB | 3276 MB | 512 MB / 2 cpu | **4** / 1 | 1 | Comfortable for a small cohort. Recommended floor for real use. |
| **Recommended** | 8 | 16 GB | 6553 MB | 512 MB / 2 cpu | **8** / — | **2** | Parallel builds + healthy execution throughput. |
| **Large** | 16 | 32 GB | 13107 MB | 512 MB / 2 cpu | **16** (CPU-capped) | 2 | Concurrency capped at cores, not memory — add nodes to scale further. |

Notes:
- Below **2 vCPU / 2 GB** the reserve consumes nearly all RAM → `maxExec` floors
  at 1 and builds contend with the app. Not recommended.
- To scale past one box, run **multiple workers** — the claim RPCs use
  `FOR UPDATE SKIP LOCKED`, so N workers share the queue safely.
- **GPU:** none of the current runtimes request GPUs; the base image is
  `mambaorg/micromamba` (CPU). A GPU tier would need `--gpus`, the NVIDIA
  Container Toolkit, and a CUDA base image — out of scope for this sizing.

---

## Two caveats that bite in production

### 1. `NEXT_PUBLIC_SUPABASE_URL` is baked at **build** time

Anything prefixed `NEXT_PUBLIC_` is compiled into the **browser bundle** during
`next build`. If you build with `http://127.0.0.1:54321` and then serve the app
to browsers on other machines, their JS calls `127.0.0.1` — their own laptop —
and every request fails.

**Fix:** set `NEXT_PUBLIC_SUPABASE_URL` to the address browsers can actually
reach (e.g. `https://your-host`) **before** `npm run build`, then rebuild.
`scripts/install.sh` warns when it detects a local URL with a `PUBLIC_HOST` set.

### 2. Docker socket / DinD isolation

The worker launches sandboxed containers through the Docker daemon. Whether via
the mounted host socket (`-v /var/run/docker.sock`) or true Docker-in-Docker,
**control of that daemon is effectively root on the host.** Sandbox flags
(`--network none`, non-root user, `--pids-limit`, pinned `--memory`/`--memory-swap`,
`--rm`) constrain the *guest* code, but not a compromise of the daemon itself.

**Fix / policy:** never co-locate the worker + `docker.sock` on the same host as
the public web app (see [`worker/Dockerfile`](../worker/Dockerfile) header). Put
the worker on its own Docker host; the app and Supabase live elsewhere. Only the
mem/cpu/concurrency **numbers** are host-aware — the security flags are fixed.
