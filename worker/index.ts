/**
 * Runtime Studio worker (MVP3, PRD §10.4/§10.5) — a STANDALONE process, NOT
 * part of Next.js. Start it with:  npm run worker   (npx jiti worker/index.ts)
 *
 * HOST-AWARE CONCURRENCY: at startup the worker detects host resources
 * (lib/sysinfo) and computes a tuning (lib/runtime-tuning) — how many jobs to
 * run at once and the per-job memory/cpu/timeout — instead of the old fixed
 * one-at-a-time / 512m / 1cpu. It then runs up to `maxConcurrentExecutions`
 * execution jobs and `maxConcurrentBuilds` heavy build jobs (runtime image
 * builds + marimo demo exports) CONCURRENTLY. Each claim uses the FOR UPDATE
 * SKIP LOCKED RPCs in 0004_runtime.sql, so concurrent claims (even across
 * several worker processes) never hand the same row to two runners. A job
 * failure is caught and recorded, never allowed to kill the loop. SIGINT/
 * SIGTERM stop claiming and drain in-flight jobs, then exit cleanly.
 *
 * Uses the service-role client (bypasses RLS) — the trusted server-side path.
 */
import { processBuild } from './build';
import { processDemoBuild } from './demo';
import { processExecution } from './execute';
import { getWorkerEnv } from './env';
import { createWorkerClient, type WorkerClient } from './supabase';
import { detectHostResources } from '../lib/sysinfo';
import { computeWorkerTuning, tuningBanner, type WorkerTuning } from '../lib/runtime-tuning';

let running = true;

// Live counts of jobs currently executing, used to enforce the tuned ceilings
// and to drain cleanly on shutdown. Heavy builds (runtime image builds + marimo
// demo exports) share ONE pool since both are docker-build/pip-heavy.
let inFlightExecutions = 0;
let inFlightBuilds = 0;

// Stale-job recovery: a worker that dies mid-job leaves its row stuck in
// 'running' forever, because claims only ever pick 'queued' rows. Sweep such
// orphans to 'failed' on startup and periodically so they don't hang around.
const STALE_EXEC_MS = 10 * 60 * 1000; // executions 'running' longer than this
const STALE_BUILD_MS = 30 * 60 * 1000; // builds 'running' longer than this
const STALE_DEMO_MS = 20 * 60 * 1000; // demo builds 'building' longer than this
const SWEEP_INTERVAL_MS = 60 * 1000; // sweep at most once a minute in the loop

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fail jobs orphaned by a previously-crashed worker (status='running' with no
 * live worker finishing them). Never throws in the caller's path — errors are
 * logged so a transient DB hiccup can't kill the loop.
 */
async function sweepStaleJobs(supabase: WorkerClient): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const execCutoff = new Date(now.getTime() - STALE_EXEC_MS).toISOString();
  const buildCutoff = new Date(now.getTime() - STALE_BUILD_MS).toISOString();
  const demoCutoff = new Date(now.getTime() - STALE_DEMO_MS).toISOString();

  // Executions: claimed (claim_execution flips to 'running') but never
  // finished. created_at is the claim proxy (the worker sets no claimed_at).
  const { data: execs, error: execErr } = await supabase
    .from('executions')
    .update({ status: 'failed', stderr: 'worker lost', finished_at: nowIso })
    .eq('status', 'running')
    .lt('created_at', execCutoff)
    .select('id');
  if (execErr) {
    console.error('[worker] stale-execution sweep error:', execErr.message);
  } else if (execs && execs.length > 0) {
    console.log(`[worker] swept ${execs.length} stale execution(s) → failed (worker lost)`);
  }

  // Runtime builds: claim_runtime_build sets started_at when it flips to
  // 'running'. supabase-js can't express `log = log || …`, so read the stale
  // rows and append the marker per row (stale builds are rare).
  const { data: builds, error: buildErr } = await supabase
    .from('runtime_builds')
    .select('id, log')
    .eq('status', 'running')
    .lt('started_at', buildCutoff);
  if (buildErr) {
    console.error('[worker] stale-build sweep error:', buildErr.message);
  } else if (builds && builds.length > 0) {
    for (const build of builds) {
      await supabase
        .from('runtime_builds')
        .update({ status: 'failed', log: `${build.log}\n[worker lost]`, finished_at: nowIso })
        .eq('id', build.id);
    }
    console.log(`[worker] swept ${builds.length} stale build(s) → failed (worker lost)`);
  }

  // Marimo demo builds: claim_marimo_build touches updated_at when it flips to
  // in-flight; a demo stuck 'building' with no bundle past the cutoff is an
  // orphan. Append the marker per row (same reason as runtime_builds above).
  const { data: demos, error: demoErr } = await supabase
    .from('marimo_apps')
    .select('id, log')
    .eq('status', 'building')
    .is('bundle_path', null)
    .lt('updated_at', demoCutoff);
  if (demoErr) {
    console.error('[worker] stale-demo sweep error:', demoErr.message);
  } else if (demos && demos.length > 0) {
    for (const demo of demos) {
      await supabase
        .from('marimo_apps')
        .update({ status: 'failed', log: `${demo.log}\n[worker lost]` })
        .eq('id', demo.id);
    }
    console.log(`[worker] swept ${demos.length} stale demo build(s) → failed (worker lost)`);
  }
}

// Launch helpers: run a job in the BACKGROUND (not awaited by the pump) while
// keeping the in-flight counter accurate. Each processX already swallows its
// own errors and writes the outcome back, but we guard here too so a rejected
// promise can never crash the process or leak a counter.
function runBuild(supabase: WorkerClient, build: ClaimedRow, tuning: WorkerTuning): void {
  inFlightBuilds++;
  void processBuild(supabase, build as never, tuning)
    .catch((err) => console.error('[worker] build crashed:', errMsg(err)))
    .finally(() => {
      inFlightBuilds--;
    });
}

function runDemo(supabase: WorkerClient, demo: ClaimedRow): void {
  inFlightBuilds++;
  void processDemoBuild(supabase, demo as never)
    .catch((err) => console.error('[worker] demo crashed:', errMsg(err)))
    .finally(() => {
      inFlightBuilds--;
    });
}

function runExecution(supabase: WorkerClient, exec: ClaimedRow, tuning: WorkerTuning): void {
  inFlightExecutions++;
  void processExecution(supabase, exec as never, tuning)
    .catch((err) => console.error('[worker] execution crashed:', errMsg(err)))
    .finally(() => {
      inFlightExecutions--;
    });
}

/**
 * Claim and launch as many jobs as the tuned ceilings allow, without blocking
 * on them. Heavy builds (runtime builds + demos) fill the build pool; code runs
 * fill the execution pool. Returns true if at least one job was claimed this
 * pass (so the caller skips the poll delay and immediately tries for more).
 */
async function pump(supabase: WorkerClient, tuning: WorkerTuning): Promise<boolean> {
  let claimed = false;

  // Build pool: runtime image builds, then marimo demo builds.
  while (running && inFlightBuilds < tuning.maxConcurrentBuilds) {
    const { data, error } = await supabase.rpc('claim_runtime_build');
    if (error) {
      console.error('[worker] claim_runtime_build error:', error.message);
      break;
    }
    if (data && data.length > 0) {
      runBuild(supabase, data[0] as ClaimedRow, tuning);
      claimed = true;
    } else break;
  }
  while (running && inFlightBuilds < tuning.maxConcurrentBuilds) {
    const { data, error } = await supabase.rpc('claim_marimo_build');
    if (error) {
      console.error('[worker] claim_marimo_build error:', error.message);
      break;
    }
    if (data && data.length > 0) {
      runDemo(supabase, data[0] as ClaimedRow);
      claimed = true;
    } else break;
  }

  // Execution pool: code runs.
  while (running && inFlightExecutions < tuning.maxConcurrentExecutions) {
    const { data, error } = await supabase.rpc('claim_execution');
    if (error) {
      console.error('[worker] claim_execution error:', error.message);
      break;
    }
    if (data && data.length > 0) {
      runExecution(supabase, data[0] as ClaimedRow, tuning);
      claimed = true;
    } else break;
  }

  return claimed;
}

// The claim RPCs return heterogeneous rows; each processX narrows what it needs.
type ClaimedRow = Record<string, unknown>;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main(): Promise<void> {
  const { pollMs } = getWorkerEnv();
  const supabase = createWorkerClient();

  // Detect host resources and compute the tuning ONCE at startup, then log a
  // clear banner so operators can see exactly what limits this worker adopted.
  const host = detectHostResources();
  const tuning = computeWorkerTuning(host);
  console.log(tuningBanner(host, tuning));
  if (!host.dockerAvailable) {
    console.error(
      '[worker] WARNING: docker not detected — build/execution jobs will fail until Docker is available.',
    );
  }

  const shutdown = () => {
    if (running) {
      running = false;
      console.log('[worker] shutdown signal received — draining in-flight jobs…');
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[worker] started (poll ${pollMs}ms). Waiting for jobs…`);

  // Recover orphans left by a previously-crashed worker before serving new
  // jobs, then re-sweep periodically for workers that die while this one runs.
  await sweepStaleJobs(supabase).catch((err) =>
    console.error('[worker] startup sweep error:', errMsg(err)),
  );
  let lastSweep = Date.now();

  while (running) {
    try {
      if (Date.now() - lastSweep > SWEEP_INTERVAL_MS) {
        lastSweep = Date.now();
        await sweepStaleJobs(supabase);
      }
      const didClaim = await pump(supabase, tuning);
      // Sleep only when we neither claimed anything nor have room to claim more
      // (all pools full) — otherwise loop immediately to top up the pools.
      const poolsFull =
        inFlightExecutions >= tuning.maxConcurrentExecutions &&
        inFlightBuilds >= tuning.maxConcurrentBuilds;
      if (!didClaim || poolsFull) await sleep(pollMs);
    } catch (err) {
      // A claim/processing crash must never end the loop.
      console.error('[worker] loop error:', errMsg(err));
      await sleep(pollMs);
    }
  }

  // Drain: stop claiming, let in-flight jobs finish before exiting.
  while (inFlightExecutions + inFlightBuilds > 0) {
    console.log(
      `[worker] draining… ${inFlightExecutions} execution(s), ${inFlightBuilds} build(s) in flight`,
    );
    await sleep(500);
  }

  console.log('[worker] stopped.');
  process.exit(0);
}

void main();
