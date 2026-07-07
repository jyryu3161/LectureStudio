import type { GenericNode } from 'myst-common';

import { renderMystNodes } from '@/lib/render/mdast';

/**
 * `student-detail` block (PRD §5.5): visible to students, and "collapsible
 * in Lecture Mode" -- expressed here with a native `<details open>`, which
 * gives real collapse/expand for free (no client JS/hooks needed, so this
 * stays a plain server-renderable element) while defaulting to expanded for
 * Reading Mode.
 */
export function StudentDetailBlock({ node, keyPrefix }: { node: GenericNode; keyPrefix: string }) {
  return (
    <details open className="mb-7 rounded-lg border border-border-subtle bg-white/60 px-5 py-4">
      <summary className="cursor-pointer select-none font-mono text-[10.5px] uppercase tracking-[0.09em] text-muted-foreground marker:text-muted-foreground">
        Student Detail
      </summary>
      <div className="mt-2.5 font-serif text-[18px] leading-[1.55] text-ink">
        {renderMystNodes(node.children, keyPrefix)}
      </div>
    </details>
  );
}
