/**
 * Deterministic Dockerfile generation for a runtime recipe (MVP3, PRD §10.4).
 *
 * `generateDockerfile` is a pure function of its input (no dates, no random
 * ids) so it is snapshot-testable and produces byte-identical output for a
 * given spec — the worker writes exactly this to the build context.
 *
 * Layering rationale (matches the sandbox contract):
 *   - FROM the micromamba base so `micromamba` is on PATH.
 *   - apt packages install as root, then we drop back to the unprivileged
 *     $MAMBA_USER the base image ships (never run as root at exec time).
 *   - python + conda packages via `micromamba install -c conda-forge`.
 *   - pip packages only when present (skip the layer entirely otherwise).
 *   - CMD ["python"] so `docker run -i <tag> python - < code` works, and a
 *     bare `docker run <tag>` still lands in a python REPL.
 */
import type { RuntimeSpec } from './types';

/** Escape a token for safe single-quote-free use in a RUN line. */
function pkgList(pkgs: readonly string[]): string {
  // Package names are validated on input; join with spaces for the shell.
  return pkgs.map((p) => p.trim()).filter(Boolean).join(' ');
}

/**
 * Best-effort map from a distribution/package name to the module you would
 * `import` in Python. Used by the worker's post-build import smoke test.
 * Unknown packages fall back to a normalized form (dashes -> underscores),
 * which is correct for the common case (e.g. `requests`, `numpy`).
 */
const IMPORT_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  'scikit-learn': 'sklearn',
  'scikit-image': 'skimage',
  pyyaml: 'yaml',
  pillow: 'PIL',
  'opencv-python': 'cv2',
  'opencv-python-headless': 'cv2',
  beautifulsoup4: 'bs4',
  'python-dateutil': 'dateutil',
  'python-dotenv': 'dotenv',
  'msgpack-python': 'msgpack',
  'attrs': 'attr',
};

/** Module name to import-test for a given conda/pip package (best-effort). */
export function packageImportName(pkg: string): string {
  // Strip any version/extra spec: `numpy==1.26`, `numpy>=1`, `foo[bar]`.
  const bare = pkg
    .trim()
    .toLowerCase()
    .split(/[<>=!~ []/, 1)[0]
    .trim();
  if (bare in IMPORT_NAME_OVERRIDES) return IMPORT_NAME_OVERRIDES[bare];
  return bare.replace(/-/g, '_');
}

/**
 * Generate the Dockerfile text for a runtime recipe. Pure + deterministic.
 */
export function generateDockerfile(spec: RuntimeSpec): string {
  const base = spec.base_image.trim() || 'mambaorg/micromamba:1.5-jammy';
  const python = spec.python_version.trim() || '3.11';
  const conda = pkgList(spec.conda_packages ?? []);
  const pip = pkgList(spec.pip_packages ?? []);
  const apt = pkgList(spec.apt_packages ?? []);

  const lines: string[] = [];
  lines.push(`FROM ${base}`);
  lines.push('');

  if (apt) {
    // apt needs root; drop back to the unprivileged mamba user afterwards.
    lines.push('USER root');
    lines.push(
      `RUN apt-get update && apt-get install -y --no-install-recommends ${apt} \\`,
    );
    lines.push('    && rm -rf /var/lib/apt/lists/*');
    lines.push('USER $MAMBA_USER');
    lines.push('');
  }

  // python + conda packages in one solve for a smaller, consistent env.
  const condaSpec = conda ? `python=${python} ${conda}` : `python=${python}`;
  lines.push(
    `RUN micromamba install -y -n base -c conda-forge ${condaSpec} \\`,
  );
  lines.push('    && micromamba clean --all --yes');
  lines.push('');

  if (pip) {
    // Run pip inside the base env; --no-cache-dir keeps the layer lean.
    lines.push(
      `RUN micromamba run -n base pip install --no-cache-dir ${pip}`,
    );
    lines.push('');
  }

  lines.push('CMD ["python"]');

  return lines.join('\n') + '\n';
}
