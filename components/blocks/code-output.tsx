import type { GenericNode } from 'myst-common';

/**
 * `code-output` block (PRD §5.5): a code example's execution result or a
 * static result. No authoring syntax produces this block type yet --
 * `blockTypeOf` (lib/content/blocks.ts) never returns `'code-output'` from
 * parsing today, this exists for the execution pipeline the PRD describes
 * for a later milestone (§11 Code Execution) to start writing rows into
 * without a render-layer change. Renders whatever text-like content shows
 * up as plain preformatted output; never throws on an unexpected shape.
 */
function extractOutputText(node: GenericNode): string {
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) {
    return node.children
      .map((child) => (typeof child.value === 'string' ? child.value : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function CodeOutputBlock({ node }: { node: GenericNode; keyPrefix: string }) {
  const text = extractOutputText(node).trim();

  return (
    <div className="mb-7 overflow-hidden rounded-md border border-border">
      <div className="border-b border-border-subtle bg-[#f7f7f4] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
        Output
      </div>
      <pre className="m-0 overflow-x-auto bg-white p-4 font-mono text-[12.5px] leading-[1.6] text-[#3a6b4a]">
        {text || '(no output)'}
      </pre>
    </div>
  );
}
