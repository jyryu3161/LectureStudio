/**
 * Thin, dependency-free wrapper around the `docker` CLI for the worker.
 *
 * `spawnCapture` runs a command, streams output to an optional `onLog` sink,
 * caps captured stdout/stderr at a byte budget (so a runaway program can't
 * OOM the worker), and enforces a wall-clock timeout. On timeout it invokes
 * `onTimeout` (used by the executor to `docker kill` the container) and then
 * SIGKILLs the CLI child. The worker never lets a job crash the loop — this
 * helper always resolves, never rejects.
 */
import { spawn } from 'node:child_process';

export interface SpawnOptions {
  stdin?: string;
  /** Byte cap per stream; excess is dropped and a truncation marker appended. */
  capBytes?: number;
  timeoutMs?: number;
  /** Called once when the timeout fires (e.g. to `docker kill` the container). */
  onTimeout?: () => void;
  /** Called with each stdout/stderr chunk (for streaming build logs). */
  onLog?: (chunk: string) => void;
}

export interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

/** Byte-capped string accumulator. */
class Capped {
  private parts: string[] = [];
  private bytes = 0;
  private truncated = false;

  constructor(private readonly cap: number) {}

  push(chunk: string): void {
    if (this.truncated) return;
    const size = Buffer.byteLength(chunk);
    if (this.bytes + size <= this.cap) {
      this.parts.push(chunk);
      this.bytes += size;
    } else {
      const remaining = this.cap - this.bytes;
      if (remaining > 0) {
        // Slice by bytes to stay under the cap even with multibyte chars.
        this.parts.push(Buffer.from(chunk).subarray(0, remaining).toString('utf8'));
        this.bytes = this.cap;
      }
      this.truncated = true;
    }
  }

  toString(): string {
    return this.parts.join('') + (this.truncated ? '\n…[output truncated]' : '');
  }
}

export function spawnCapture(
  command: string,
  args: string[],
  opts: SpawnOptions = {},
): Promise<SpawnResult> {
  return new Promise((resolvePromise) => {
    const start = Date.now();
    const cap = opts.capBytes ?? Number.POSITIVE_INFINITY;
    const stdout = new Capped(cap);
    const stderr = new Capped(cap);
    let timedOut = false;
    let settled = false;

    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise({
        code,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        timedOut,
        durationMs: Date.now() - start,
      });
    };

    child.stdout.on('data', (d: Buffer) => {
      const s = d.toString('utf8');
      stdout.push(s);
      opts.onLog?.(s);
    });
    child.stderr.on('data', (d: Buffer) => {
      const s = d.toString('utf8');
      stderr.push(s);
      opts.onLog?.(s);
    });

    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs && Number.isFinite(opts.timeoutMs)) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          opts.onTimeout?.();
        } catch {
          // best-effort container kill; ignore.
        }
        child.kill('SIGKILL');
      }, opts.timeoutMs);
    }

    child.on('error', (err) => {
      stderr.push(`\n[spawn error] ${err instanceof Error ? err.message : String(err)}`);
      finish(-1);
    });
    child.on('close', (code) => finish(code));

    if (opts.stdin != null) {
      child.stdin.on('error', () => {
        // Ignore EPIPE if the child exits before consuming stdin.
      });
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }
  });
}

/** Fire-and-forget `docker kill <name>` (used on execution timeout). */
export function dockerKill(name: string): void {
  const child = spawn('docker', ['kill', name], { stdio: 'ignore' });
  child.on('error', () => {
    /* ignore */
  });
}

/** Best-effort `docker rm -f <name>` cleanup. Resolves regardless of outcome. */
export function dockerRemove(name: string): Promise<void> {
  return new Promise((resolvePromise) => {
    const child = spawn('docker', ['rm', '-f', name], { stdio: 'ignore' });
    child.on('error', () => resolvePromise());
    child.on('close', () => resolvePromise());
  });
}
