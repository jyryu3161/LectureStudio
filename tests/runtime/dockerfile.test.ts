import { describe, expect, it } from 'vitest';

import { generateDockerfile, packageImportName } from '@/lib/runtime/dockerfile';
import type { RuntimeSpec } from '@/lib/runtime/types';

const MINIMAL: RuntimeSpec = {
  base_image: 'mambaorg/micromamba:1.5-jammy',
  python_version: '3.11',
  conda_packages: [],
  pip_packages: [],
  apt_packages: [],
};

const FULL: RuntimeSpec = {
  base_image: 'mambaorg/micromamba:1.5-jammy',
  python_version: '3.10',
  conda_packages: ['numpy', 'scipy'],
  pip_packages: ['requests', 'scikit-learn==1.4.0'],
  apt_packages: ['git', 'ffmpeg'],
};

describe('generateDockerfile', () => {
  it('emits a minimal, pip/apt-free Dockerfile for a bare python runtime', () => {
    const out = generateDockerfile(MINIMAL);
    expect(out).toMatchInlineSnapshot(`
      "FROM mambaorg/micromamba:1.5-jammy

      RUN micromamba install -y -n base -c conda-forge python=3.11 \\
          && micromamba clean --all --yes

      CMD ["python"]
      "
    `);
    // No root/apt or pip layers when there are no such packages.
    expect(out).not.toContain('USER root');
    expect(out).not.toContain('pip install');
  });

  it('emits apt (as root, then drops user), conda, and pip layers when present', () => {
    const out = generateDockerfile(FULL);
    expect(out).toMatchInlineSnapshot(`
      "FROM mambaorg/micromamba:1.5-jammy

      USER root
      RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg \\
          && rm -rf /var/lib/apt/lists/*
      USER $MAMBA_USER

      RUN micromamba install -y -n base -c conda-forge python=3.10 numpy scipy \\
          && micromamba clean --all --yes

      RUN micromamba run -n base pip install --no-cache-dir requests scikit-learn==1.4.0

      CMD ["python"]
      "
    `);
  });

  it('is deterministic (same input → byte-identical output)', () => {
    expect(generateDockerfile(FULL)).toBe(generateDockerfile(FULL));
  });

  it('runs the container as non-root and never leaves USER as root', () => {
    const out = generateDockerfile(FULL);
    // The last USER directive before CMD must be the unprivileged mamba user.
    const lastUser = out.split('\n').filter((l) => l.startsWith('USER')).pop();
    expect(lastUser).toBe('USER $MAMBA_USER');
  });
});

describe('packageImportName', () => {
  it('maps well-known distributions to their import module', () => {
    expect(packageImportName('scikit-learn')).toBe('sklearn');
    expect(packageImportName('pyyaml')).toBe('yaml');
    expect(packageImportName('pillow')).toBe('PIL');
    expect(packageImportName('opencv-python')).toBe('cv2');
    expect(packageImportName('beautifulsoup4')).toBe('bs4');
  });

  it('strips version specifiers and normalizes dashes for unknown packages', () => {
    expect(packageImportName('numpy==1.26')).toBe('numpy');
    expect(packageImportName('requests>=2')).toBe('requests');
    expect(packageImportName('my-cool-pkg')).toBe('my_cool_pkg');
    expect(packageImportName('foo[extra]')).toBe('foo');
  });
});
