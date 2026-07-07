import type { ReactElement } from 'react';

import { filterByVisibility } from '@/lib/auth/guards';
import type { Block } from '@/lib/content';

// NOTE on import direction: this file (lib/render) intentionally imports
// from components/blocks -- it composes those presentational components
// into the block tree, which is its whole job. To keep that a one-way
// dependency (no cycle back through lib/render), components/blocks/* must
// only ever import the *specific* lib/render utility files it needs
// (lib/render/mdast, lib/render/katex, lib/render/block-nodes) -- never
// this file, and never the `@/lib/render` barrel.
import { BlockContent } from '@/components/blocks/block-content';
import { BlockShell } from '@/components/blocks/block-shell';

import { findCodeNode } from './block-nodes';
import { highlightCode } from './shiki';
import type { RenderOptions } from './types';

export type { RenderOptions } from './types';

/**
 * Turns parsed content Blocks into the Reading Mode block tree.
 *
 * SECURITY (PRD §5.6 / §15.3, the instructor-note protection invariant):
 * `instructor-note` (visibility `'instructor'`) blocks are stripped from
 * `blocks` via `filterByVisibility` (lib/auth/guards.ts) *before* a single
 * React element is created for them -- not rendered-then-hidden with CSS.
 * For a student/guest, an excluded block never becomes a React element, so
 * it cannot appear in the returned tree, in any HTML string later rendered
 * from that tree (e.g. `renderToStaticMarkup`), or in an RSC payload
 * serialized from it. See tests/render/instructor-filter.test.ts.
 *
 * Every surviving block is wrapped in a `<section data-block-id
 * data-content-hash>` shell (PRD §5.3) so annotations/Lecture Mode can
 * anchor onto it later.
 */
export async function renderBlocks(blocks: Block[], options: RenderOptions): Promise<ReactElement[]> {
  const visibleBlocks = filterByVisibility(blocks, options.role);

  // Shiki's highlighter is expensive to instantiate (loads WASM + grammar
  // data) -- only pay for it when a visible block actually needs
  // highlighting, and share one instance across all of them (see the
  // module-level singleton in lib/render/shiki.ts).
  const codeHtmlById = new Map<string, string>();
  const codeBlocks = visibleBlocks.filter((block) => block.blockType === 'code');
  if (codeBlocks.length > 0) {
    await Promise.all(
      codeBlocks.map(async (block) => {
        const codeNode = findCodeNode(block.node);
        const html = await highlightCode(codeNode?.value ?? '', codeNode?.lang);
        codeHtmlById.set(block.id, html);
      }),
    );
  }

  return visibleBlocks.map((block) => (
    <BlockShell key={block.id} block={block}>
      <BlockContent block={block} codeHtml={codeHtmlById.get(block.id) ?? null} />
    </BlockShell>
  ));
}
