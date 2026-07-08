import { describe, expect, it } from 'vitest';

import { ensureStableIds } from '@/lib/content';
import { directiveSnippet } from '@/lib/demos/snippet';

const APP_ID = '11111111-2222-3333-4444-555555555555';

describe('interactive-demo directive', () => {
  it('parses the app id argument into the block metadata', () => {
    const source = `# Demo chapter

:::{interactive-demo} ${APP_ID}
:::
`;
    const { blocks } = ensureStableIds(source);
    const demo = blocks.find((b) => b.blockType === 'interactive-demo');

    expect(demo).toBeDefined();
    expect(demo?.blockType).toBe('interactive-demo');
    expect(demo?.metadata.appId).toBe(APP_ID);
    // public visibility — a demo is student-facing, never instructor-only.
    expect(demo?.visibility).toBe('public');
  });

  it('carries an optional caption as the block body while keeping the app id', () => {
    const source = `:::{interactive-demo} ${APP_ID}
Interactive merge-sort visualizer.
:::
`;
    const { blocks } = ensureStableIds(source);
    const demo = blocks.find((b) => b.blockType === 'interactive-demo');

    expect(demo?.metadata.appId).toBe(APP_ID);
    // the caption text survives as body children on the node
    expect(JSON.stringify(demo?.node.children)).toContain('Interactive merge-sort visualizer');
  });

  it('produces exactly one top-level block (one-node-per-block rule)', () => {
    const source = `:::{interactive-demo} ${APP_ID}
:::
`;
    const { blocks } = ensureStableIds(source);
    expect(blocks).toHaveLength(1);
  });
});

describe('directiveSnippet', () => {
  it('renders the interactive-demo authoring snippet for an app id', () => {
    expect(directiveSnippet(APP_ID)).toBe(`:::{interactive-demo} ${APP_ID}\n:::`);
  });

  it('round-trips: the snippet parses back to a demo block carrying the id', () => {
    const { blocks } = ensureStableIds(`${directiveSnippet(APP_ID)}\n`);
    const demo = blocks.find((b) => b.blockType === 'interactive-demo');
    expect(demo?.metadata.appId).toBe(APP_ID);
  });
});
