import type { GenericNode } from 'myst-common';

import { renderMath } from '@/lib/render/katex';
import { renderMystNodes } from '@/lib/render/mdast';

/** Finds the first `math`/`inlineMath` LaTeX value nested anywhere under `node`. */
function findMathValue(node: GenericNode): string | null {
  if ((node.type === 'math' || node.type === 'inlineMath') && typeof node.value === 'string') {
    return node.value;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findMathValue(child);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * `equation` block (PRD §5.5): LaTeX rendered with KaTeX. Handles both a
 * bare `$$ ... $$` (a top-level mdast `math` node) and our `:::{equation}`
 * directive (a `type: 'equation'` wrapper around parsed body content, see
 * lib/content/directives.ts) -- in both cases we just need the LaTeX source
 * wherever it ends up in the tree. If a `:::{equation}` body somehow has no
 * actual math in it, falls back to rendering the body as plain content
 * instead of feeding non-LaTeX text into KaTeX.
 */
export function EquationBlock({ node, keyPrefix }: { node: GenericNode; keyPrefix: string }) {
  const value = findMathValue(node);

  return (
    <div className="mb-7 overflow-x-auto rounded-md border border-border bg-white p-6 text-center">
      {value !== null ? (
        <div className="text-[19px] text-ink" dangerouslySetInnerHTML={{ __html: renderMath(value, true) }} />
      ) : (
        <div className="text-left font-serif text-[18px] leading-[1.55] text-ink">
          {renderMystNodes(node.children, keyPrefix)}
        </div>
      )}
    </div>
  );
}
