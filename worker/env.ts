/**
 * Minimal environment loading for the standalone worker process.
 *
 * The worker runs OUTSIDE Next.js (`npx jiti worker/index.ts`), so Next's
 * automatic `.env.local` loading does not apply. This reads `.env.local` from
 * the current working directory (repo root) as a fallback ONLY for vars not
 * already present in `process.env` — an explicit env always wins. No new
 * dependency: a tiny KEY=VALUE parser is enough for the local stack.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue; // explicit env wins
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export interface WorkerEnv {
  url: string;
  serviceRoleKey: string;
  pollMs: number;
}

/** Resolve required worker env (loading .env.local as a fallback). */
export function getWorkerEnv(): WorkerEnv {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'worker: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
        'Set them in .env.local (local stack) or the process environment.',
    );
  }
  const pollMs = Number(process.env.WORKER_POLL_MS ?? '1000') || 1000;
  return { url, serviceRoleKey, pollMs };
}
