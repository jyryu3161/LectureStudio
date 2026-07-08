/**
 * Print the detected host resources and the worker tuning they produce.
 *
 * Run with:  npm run tuning        (jiti scripts/print-tuning.ts)
 * Used by scripts/install.sh to show operators the limits this box will adopt,
 * and handy for verifying auto-tuning without starting the full worker.
 *
 * Respects the same env overrides as the worker: WORKER_MAX_CONCURRENCY,
 * JOB_MEMORY_MB, JOB_CPUS, JOB_TIMEOUT_SECONDS.
 */
import { computeWorkerTuning, tuningBanner } from '../lib/runtime-tuning';
import { detectHostResources } from '../lib/sysinfo';

const host = detectHostResources();
const tuning = computeWorkerTuning(host);

console.log(tuningBanner(host, tuning));
console.log(JSON.stringify({ host, tuning }, null, 2));
