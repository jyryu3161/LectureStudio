import type { GenericNode } from 'myst-common';

import { renderMystNodes } from '@/lib/render/mdast';

/** Plain reading-body `paragraph` block (PRD §5.5). */
export function ParagraphBlock({ node, keyPrefix }: { node: GenericNode; keyPrefix: string }) {
  // `blockTypeOf` (lib/content/blocks.ts) maps any unrecognized top-level node
  // to 'paragraph' as a safe, non-crashing fallback -- but that set now
  // legitimately includes block-level nodes like `blockquote`/`list`/`table`
  // (e.g. approved AI-artifact MyST appended to a chapter's source). Wrapping
  // those in a `<p>` would emit invalid nested HTML (`<p><p>`, `<p><ul>`),
  // which fails React SSR hydration on the reading/lecture/preview surfaces.
  // Only a genuine `paragraph` node's children may live in a `<p>`; any other
  // node renders as its own block element via the mdast renderer, which
  // already handles blockquote/list/etc. correctly.
  if (node.type !== 'paragraph') {
    return <>{renderMystNodes([node], keyPrefix)}</>;
  }
  return (
    <p className="mb-[1.35em] font-serif text-lg leading-[1.72] text-ink last:mb-0">
      {renderMystNodes(node.children, keyPrefix)}
    </p>
  );
}
