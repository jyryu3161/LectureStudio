import type { GenericNode } from 'myst-common';

import { renderMystNodes } from '@/lib/render/mdast';

/** Plain reading-body `paragraph` block (PRD §5.5). */
export function ParagraphBlock({ node, keyPrefix }: { node: GenericNode; keyPrefix: string }) {
  return (
    <p className="mb-[1.35em] font-serif text-lg leading-[1.72] text-ink last:mb-0">
      {renderMystNodes(node.children, keyPrefix)}
    </p>
  );
}
