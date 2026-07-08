/**
 * Runtime Studio worker (MVP3, PRD §10.4/§10.5) — a STANDALONE process, NOT
 * part of Next.js. Start it with:  npm run worker   (npx jiti worker/index.ts)
 *
 * Poll loop: each tick, atomically claim ONE queued runtime_build, else ONE
 * queued execution, via the FOR UPDATE SKIP LOCKED RPCs in 0004_runtime.sql
 * (safe to run multiple workers). Jobs are processed one at a time; a job
 * failure is caught and recorded, never allowed to kill the loop. SIGINT/
 * SIGTERM drain the current job, then exit cleanly.
 *
 * Uses the service-role client (bypasses RLS) — the trusted server-side path.
 */
import { processBuild } from './build';
import { processDemoBuild } from './demo';
import { processExecution } from './execute';
import { getWorkerEnv } from './env';
import { createWorkerClient, type WorkerClient } from './supabase';

let running = true;

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

/** Do one unit of work. Returns true if a job was processed (skip the poll delay). */
async function tick(supabase: WorkerClient): Promise<boolean> {
  const { data: builds, error: buildErr } = await supabase.rpc('claim_runtime_build');
  if (buildErr) {
    console.error('[worker] claim_runtime_build error:', buildErr.message);
  } else if (builds && builds.length > 0) {
    await processBuild(supabase, builds[0]);
    return true;
  }

  const { data: execs, error: execErr } = await supabase.rpc('claim_execution');
  if (execErr) {
    console.error('[worker] claim_execution error:', execErr.message);
  } else if (execs && execs.length > 0) {
    await processExecution(supabase, execs[0]);
    return true;
  }

  const { data: demos, error: demoErr } = await supabase.rpc('claim_marimo_build');
  if (demoErr) {
    console.error('[worker] claim_marimo_build error:', demoErr.message);
  } else if (demos && demos.length > 0) {
    await processDemoBuild(supabase, demos[0]);
    return true;
  }

  return false;
}

async function main(): Promise<void> {
  const { pollMs } = getWorkerEnv();
  const supabase = createWorkerClient();

  const shutdown = () => {
    if (running) {
      running = false;
      console.log('[worker] shutdown signal received — finishing current job…');
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[worker] started (poll ${pollMs}ms). Waiting for jobs…`);

  // Recover orphans left by a previously-crashed worker before serving new
  // jobs, then re-sweep periodically for workers that die while this one runs.
  await sweepStaleJobs(supabase).catch((err) =>
    console.error('[worker] startup sweep error:', err instanceof Error ? err.message : err),
  );
  let lastSweep = Date.now();

  while (running) {
    try {
      if (Date.now() - lastSweep > SWEEP_INTERVAL_MS) {
        lastSweep = Date.now();
        await sweepStaleJobs(supabase);
      }
      const didWork = await tick(supabase);
      if (!didWork) await sleep(pollMs);
    } catch (err) {
      // A claim/processing crash must never end the loop.
      console.error('[worker] tick error:', err instanceof Error ? err.message : err);
      await sleep(pollMs);
    }
  }

  console.log('[worker] stopped.');
  process.exit(0);
}

void main();
