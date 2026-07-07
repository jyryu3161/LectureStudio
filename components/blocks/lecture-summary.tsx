import type { GenericNode } from 'myst-common';

import { renderMystNodes } from '@/lib/render/mdast';

/**
 * `lecture-summary` block (PRD §5.5): the chapter's key-takeaway callout,
 * visible to students and emphasized in Lecture Mode. Styled as the
 * accent-bordered callout called for in the design tokens (accent left
 * border + a light accent tint, via the `selection` token) -- see
 * ref/design.zip's reading mockup for the visual reference this adapts.
 */
export function LectureSummaryBlock({ node, keyPrefix }: { node: GenericNode; keyPrefix: string }) {
  return (
    <div className="mb-7 rounded-r-lg border-l-[3px] border-accent bg-selection/40 py-4 pl-5 pr-5">
      <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.09em] text-muted-foreground">
        Key Summary
      </div>
      <div className="font-serif text-[18px] leading-[1.55] text-ink">
        {renderMystNodes(node.children, keyPrefix)}
      </div>
    </div>
  );
}
