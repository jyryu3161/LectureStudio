/**
 * Code-execution job: run a queued execution's code inside its runtime's
 * image under the sandbox contract (PRD §10.5).
 *
 * Sandbox flags (non-negotiable): --network none, non-root (the micromamba
 * base image's default $MAMBA_USER), --memory / --memory-swap pinned equal,
 * --cpus 1, --pids-limit 256, --rm. Code is fed on stdin to `python -`; the
 * runtime's timeout_seconds is enforced by the worker (kill the container on
 * expiry → status 'timeout'). stdout/stderr are capped at 64 KiB. Every
 * outcome is written back to the executions row; the loop never dies on a
 * single failed run.
 */
import { dockerKill, dockerRemove, spawnCapture } from './docker';
import type { WorkerClient } from './supabase';
import { OUTPUT_CAP_BYTES } from '../lib/runtime/types';
import { resolveJobLimits, type WorkerTuning } from '../lib/runtime-tuning';

interface ClaimedExecution {
  id: string;
  runtime_id: string | null;
  code: string;
}

export async function processExecution(
  supabase: WorkerClient,
  execution: ClaimedExecution,
  tuning: WorkerTuning,
): Promise<void> {
  const execId = execution.id;
  const start = Date.now();
  const containerName = `lsx-${execId}`;

  try {
    if (!execution.runtime_id) {
      throw new Error('execution has no runtime');
    }
    const { data: runtime, error: rtError } = await supabase
      .from('runtimes')
      .select('id, image_tag, status, memory_limit, timeout_seconds')
      .eq('id', execution.runtime_id)
      .single();
    if (rtError || !runtime) {
      throw new Error(`runtime ${execution.runtime_id} not found`);
    }
    if (runtime.status !== 'ready' || !runtime.image_tag) {
      throw new Error('runtime is not ready (no image to run)');
    }

    // Per-job limits with full precedence: env override > per-runtime row >
    // host-aware auto-tuned default. Only the NUMBERS are host-aware; every
    // sandbox security flag below stays fixed.
    const { memory, cpus, timeoutSeconds } = resolveJobLimits(tuning, process.env, runtime);

    const args = [
      'run',
      '--rm',
      '--name',
      containerName,
      '--network',
      'none',
      '--memory',
      memory,
      '--memory-swap',
      memory,
      '--cpus',
      cpus,
      '--pids-limit',
      '256',
      '-i',
      runtime.image_tag,
      'python',
      '-',
    ];

    const result = await spawnCapture('docker', args, {
      stdin: execution.code,
      capBytes: OUTPUT_CAP_BYTES,
      timeoutMs: timeoutSeconds * 1000,
      onTimeout: () => dockerKill(containerName),
    });

    const status = result.timedOut ? 'timeout' : result.code === 0 ? 'succeeded' : 'failed';
    const stderr = result.timedOut
      ? `${result.stderr}\n[killed: exceeded ${timeoutSeconds}s timeout]`
      : result.stderr;

    await supabase
      .from('executions')
      .update({
        status,
        stdout: result.stdout,
        stderr,
        exit_code: result.timedOut ? null : result.code,
        duration_ms: Date.now() - start,
        finished_at: new Date().toISOString(),
      })
      .eq('id', execId);
    console.log(`[worker] execution ${execId} → ${status} (${Date.now() - start}ms)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('executions')
      .update({
        status: 'failed',
        stderr: `worker error: ${message}`,
        duration_ms: Date.now() - start,
        finished_at: new Date().toISOString(),
      })
      .eq('id', execId);
    console.error(`[worker] execution ${execId} failed: ${message}`);
  } finally {
    // Belt-and-braces: --rm + AutoRemove should handle it, but ensure no
    // container lingers if we killed it or the daemon was slow.
    await dockerRemove(containerName);
  }
}
