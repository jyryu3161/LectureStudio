/**
 * Runtime build job: turn a runtime recipe into a Docker image (PRD §10.4).
 *
 * Flow: generate the Dockerfile (deterministic, via lib/runtime/dockerfile),
 * `docker build` it while streaming the log back into runtime_builds.log,
 * then run a post-build IMPORT SMOKE TEST inside the fresh image
 * (`--network none`) that imports python + each declared conda/pip package.
 * Only if every import succeeds do we mark the build succeeded and flip the
 * parent runtime to 'ready' + image_tag. Any failure marks the build failed
 * (with the captured log) and the runtime failed. Never throws — a failed
 * build must not kill the worker loop.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateDockerfile, packageImportName } from '../lib/runtime/dockerfile';

import { spawnCapture } from './docker';
import type { WorkerClient } from './supabase';

interface ClaimedBuild {
  id: string;
  runtime_id: string | null;
  created_at: string;
}

const BUILD_TIMEOUT_MS = 15 * 60 * 1000; // 15 min hard cap on a docker build.
const IMPORT_TEST_TIMEOUT_MS = 60 * 1000;

export async function processBuild(
  supabase: WorkerClient,
  build: ClaimedBuild,
): Promise<void> {
  const buildId = build.id;
  let log = '';
  let tmpDir: string | null = null;

  const flushLog = async () => {
    await supabase.from('runtime_builds').update({ log }).eq('id', buildId);
  };

  try {
    if (!build.runtime_id) {
      throw new Error('build has no runtime_id');
    }
    const { data: runtime, error: rtError } = await supabase
      .from('runtimes')
      .select('*')
      .eq('id', build.runtime_id)
      .single();
    if (rtError || !runtime) {
      throw new Error(`runtime ${build.runtime_id} not found: ${rtError?.message ?? ''}`);
    }

    const conda = (runtime.conda_packages as string[]) ?? [];
    const pip = (runtime.pip_packages as string[]) ?? [];
    const apt = (runtime.apt_packages as string[]) ?? [];

    // Build number = ordinal of this build among the runtime's builds.
    const { count } = await supabase
      .from('runtime_builds')
      .select('id', { count: 'exact', head: true })
      .eq('runtime_id', build.runtime_id)
      .lte('created_at', build.created_at);
    const buildNumber = count ?? 1;
    const imageTag = `lecturestudio/runtime-${runtime.id}:${buildNumber}`;

    const dockerfile = generateDockerfile({
      base_image: runtime.base_image,
      python_version: runtime.python_version,
      conda_packages: conda,
      pip_packages: pip,
      apt_packages: apt,
    });

    tmpDir = await mkdtemp(join(tmpdir(), 'ls-build-'));
    await writeFile(join(tmpDir, 'Dockerfile'), dockerfile, 'utf8');
    log += `# Building ${imageTag}\n${dockerfile}\n# --- docker build ---\n`;
    await flushLog();

    // Throttle log flushes so a chatty build doesn't hammer the DB.
    let lastFlush = Date.now();
    const build_res = await spawnCapture(
      'docker',
      ['build', '-t', imageTag, '-f', join(tmpDir, 'Dockerfile'), tmpDir],
      {
        timeoutMs: BUILD_TIMEOUT_MS,
        onLog: (chunk) => {
          log += chunk;
          if (Date.now() - lastFlush > 2000) {
            lastFlush = Date.now();
            void flushLog();
          }
        },
      },
    );
    log += `\n# docker build exited ${build_res.code}${build_res.timedOut ? ' (timeout)' : ''}\n`;
    if (build_res.code !== 0) {
      throw new Error(`docker build failed (exit ${build_res.code})`);
    }

    // Import smoke test: python + one import per declared package.
    const importNames = [...conda, ...pip].map(packageImportName);
    const checkLines = ['import sys', 'print(sys.version)', ...importNames.map((n) => `import ${n}`)];
    log += `# --- import test (${importNames.length} package(s)) ---\n`;
    const test_res = await spawnCapture(
      'docker',
      ['run', '--rm', '--network', 'none', imageTag, 'python', '-c', checkLines.join('\n')],
      { timeoutMs: IMPORT_TEST_TIMEOUT_MS },
    );
    log += test_res.stdout + test_res.stderr + `\n# import test exited ${test_res.code}\n`;
    if (test_res.code !== 0) {
      throw new Error('import smoke test failed — a declared package is not importable');
    }

    const finishedAt = new Date().toISOString();
    await supabase
      .from('runtime_builds')
      .update({ status: 'succeeded', image_tag: imageTag, log, finished_at: finishedAt })
      .eq('id', buildId);
    await supabase
      .from('runtimes')
      .update({ status: 'ready', image_tag: imageTag })
      .eq('id', runtime.id);
    console.log(`[worker] build ${buildId} succeeded → ${imageTag}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log += `\nERROR: ${message}\n`;
    await supabase
      .from('runtime_builds')
      .update({ status: 'failed', log, finished_at: new Date().toISOString() })
      .eq('id', buildId);
    if (build.runtime_id) {
      await supabase.from('runtimes').update({ status: 'failed' }).eq('id', build.runtime_id);
    }
    console.error(`[worker] build ${buildId} failed: ${message}`);
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
