import type { GenericNode } from 'myst-common';

import { CodeRunner } from '@/components/execution/run-button';
import { findCaptionNodes, findCodeNode } from '@/lib/render/block-nodes';
import { renderMystNodes } from '@/lib/render/mdast';

/**
 * `code` block (PRD §5.5): a source example, server-highlighted with Shiki.
 * `html` is the already-highlighted markup for this block's source,
 * precomputed once by `renderBlocks` (lib/render/render-blocks.tsx) via the
 * shared Shiki singleton (lib/render/shiki.ts) -- this component stays a
 * plain, synchronous renderer and never touches Shiki itself. Falls back to
 * an unhighlighted `<pre>` if highlighting failed upstream for any reason.
 */
export function CodeBlock({
  node,
  keyPrefix,
  html,
}: {
  node: GenericNode;
  keyPrefix: string;
  html: string | null;
}) {
  const codeNode = findCodeNode(node);
  const lang = typeof codeNode?.lang === 'string' && codeNode.lang.trim() ? codeNode.lang.trim() : 'text';
  const captionNodes = findCaptionNodes(node);

  return (
    <div className="mb-7 overflow-hidden rounded-md border border-border bg-paper">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-[#f7f7f4] px-3.5 py-2 font-mono text-[11.5px] text-muted-foreground">
        <span className="h-2 w-2 rounded-sm bg-accent" aria-hidden="true" />
        {lang}
      </div>
      {html ? (
        <div
          className="overflow-x-auto text-[13px] leading-[1.7] [&>pre]:m-0 [&>pre]:p-4 [&>pre]:font-mono"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="m-0 overflow-x-auto p-4 font-mono text-[13px] leading-[1.7] text-ink">
          <code>{codeNode?.value ?? ''}</code>
        </pre>
      )}
      {captionNodes.length > 0 && (
        <div className="border-t border-border-subtle px-3.5 py-2 text-[13px] text-muted-foreground">
          {renderMystNodes(captionNodes, `${keyPrefix}-caption`)}
        </div>
      )}
      {/* Run affordance (PRD §11.3). `keyPrefix` is the block id. The client
          component self-resolves whether to show anything at all (executable
          flag + elevated course role + ready runtime), so students see nothing
          new and non-executable blocks stay unchanged. */}
      <CodeRunner blockId={keyPrefix} code={codeNode?.value ?? ''} />
    </div>
  );
}
