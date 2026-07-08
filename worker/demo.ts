/**
 * Marimo demo build job (MVP4). Turns a marimo notebook (`marimo_apps.source`)
 * into a self-contained WASM bundle and uploads it to the PUBLIC `demos`
 * Storage bucket, so the renderer can embed it in a sandboxed iframe.
 *
 * Flow: write `source` to app.py in a temp dir, then in a `python:3.12-slim`
 * container (network ALLOWED — pip needs it, like a runtime build) run:
 *   pip install marimo
 *   marimo export html-wasm --help            # recorded in the log
 *   marimo export html-wasm --mode run app.py -o out -f
 * On success, upload every file under out/ to demos/<appId>/… via the
 * service-role client (bypasses Storage RLS) with correct content types, set
 * status='ready' + bundle_path='<appId>/index.html'. Any failure marks the
 * demo 'failed' with the captured log. Never throws — a failed build must not
 * kill the worker loop.
 *
 * VIEWING runs entirely client-side (Pyodide from CDN in the iframe sandbox);
 * only the BUILD needs network/server, exactly like runtime image builds.
 */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, posix, relative } from 'node:path';

import { spawnCapture } from './docker';
import type { WorkerClient } from './supabase';

interface ClaimedDemo {
  id: string;
  source: string;
  name: string;
}

const DEMO_BUILD_TIMEOUT_MS = 10 * 60 * 1000; // 10 min hard cap (pip + export).
const BUCKET = 'demos';

// The exact export command, verified against `marimo export html-wasm --help`
// inside python:3.12-slim: `-o` is the output DIRECTORY, `--mode run` makes the
// notebook read-only, `-f` overwrites a prior output. Recorded here and echoed
// into the build log for the audit trail.
const EXPORT_CMD = 'marimo export html-wasm --mode run app.py -o out -f';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.data': 'application/octet-stream',
};

function contentTypeFor(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Recursively list file paths under `dir`, relative to `dir` (POSIX-agnostic). */
async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(relative(dir, full));
    }
  }
  return out;
}

export async function processDemoBuild(
  supabase: WorkerClient,
  demo: ClaimedDemo,
): Promise<void> {
  const appId = demo.id;
  let log = '';
  let tmpDir: string | null = null;

  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'ls-demo-'));
    await writeFile(join(tmpDir, 'app.py'), demo.source ?? '', 'utf8');

    log += `# marimo demo build ${appId} (${demo.name})\n`;
    log += `# chosen export command: ${EXPORT_CMD}\n# --- container ---\n`;
    await supabase.from('marimo_apps').update({ log }).eq('id', appId);

    // Build container: pip install marimo, record --help, run the export.
    // Mount the temp dir at /work; workdir /work so out/ lands beside app.py.
    const script = [
      'set -e',
      'pip install --no-cache-dir marimo',
      'echo "=== marimo export html-wasm --help ==="',
      'marimo export html-wasm --help',
      'echo "=== export ==="',
      EXPORT_CMD,
      'echo "=== output tree ==="',
      'find out -type f',
    ].join(' && ');

    let lastFlush = Date.now();
    const res = await spawnCapture(
      'docker',
      ['run', '--rm', '-v', `${tmpDir}:/work`, '-w', '/work', 'python:3.12-slim', 'sh', '-lc', script],
      {
        timeoutMs: DEMO_BUILD_TIMEOUT_MS,
        onLog: (chunk) => {
          log += chunk;
          if (Date.now() - lastFlush > 2000) {
            lastFlush = Date.now();
            void supabase.from('marimo_apps').update({ log }).eq('id', appId);
          }
        },
      },
    );
    log += `\n# export exited ${res.code}${res.timedOut ? ' (timeout)' : ''}\n`;
    if (res.code !== 0) {
      throw new Error(`marimo export failed (exit ${res.code})`);
    }

    // Collect the exported bundle (recursively) from out/.
    const outDir = join(tmpDir, 'out');
    let entries: string[];
    try {
      entries = await walkFiles(outDir);
    } catch {
      throw new Error('export produced no out/ directory');
    }
    if (!entries.map((e) => e.split(/[\\/]/).join('/')).includes('index.html')) {
      throw new Error('export produced no index.html');
    }
    log += `# uploading ${entries.length} file(s) to ${BUCKET}/${appId}/\n`;

    // Upload each file under demos/<appId>/<relpath> (POSIX keys). upsert so a
    // rebuild overwrites the prior bundle in place.
    for (const rel of entries) {
      const key = `${appId}/${rel.split(/[\\/]/).join(posix.sep)}`;
      const body = await readFile(join(outDir, rel));
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(key, body, { contentType: contentTypeFor(rel), upsert: true });
      if (upErr) {
        throw new Error(`upload failed for ${key}: ${upErr.message}`);
      }
    }

    const bundlePath = `${appId}/index.html`;
    log += `# done → ${BUCKET}/${bundlePath}\n`;
    await supabase
      .from('marimo_apps')
      .update({ status: 'ready', bundle_path: bundlePath, log })
      .eq('id', appId);
    console.log(`[worker] demo ${appId} ready → ${BUCKET}/${bundlePath}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log += `\nERROR: ${message}\n`;
    await supabase
      .from('marimo_apps')
      .update({ status: 'failed', log })
      .eq('id', appId);
    console.error(`[worker] demo ${appId} failed: ${message}`);
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
