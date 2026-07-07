import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { Block } from '@/lib/content';

/**
 * The stable-id carrier every rendered block must have (PRD §5.3): a
 * `data-block-id` + `data-content-hash` pair on the actual DOM element, not
 * a parallel/virtual data structure. Annotations, Lecture Mode, and future
 * cross-block features anchor onto these attributes -- never remove or
 * rename them. Matches the PRD's own render example:
 *
 *   <section data-block-id="blk_9f2a" data-content-hash="a1b2c3">...</section>
 *
 * Used uniformly for every block type (including `instructor-note`) --
 * privileged-only visibility is enforced upstream, in `renderBlocks`
 * (lib/render/render-blocks.tsx), by never constructing this shell (or its
 * children) for an instructor-note block in the first place.
 */
export function BlockShell({
  block,
  className,
  children,
}: {
  block: Pick<Block, 'id' | 'contentHash'>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-block-id={block.id} data-content-hash={block.contentHash} className={cn(className)}>
      {children}
    </section>
  );
}
