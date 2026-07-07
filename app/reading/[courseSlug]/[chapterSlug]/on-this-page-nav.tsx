'use client';

export interface OnThisPageItem {
  id: string;
  depth: number;
  text: string;
}

/**
 * Scrolls the clicked heading's Block into view. Blocks are wrapped in a
 * `<section data-block-id>` shell (see components/blocks/block-shell.tsx) --
 * not an element with a matching `id` -- so a plain `href="#blk_x"` fragment
 * link can't rely on native browser scrolling. `href` is kept anyway as a
 * semantic/no-JS fallback; the actual scroll is done here against the real
 * data attribute every rendered block already carries.
 */
function scrollToBlock(blockId: string) {
  const selector = `[data-block-id="${CSS.escape(blockId)}"]`;
  document
    .querySelector<HTMLElement>(selector)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Right-rail "On this page" section (design.zip reading mockup): anchor
 * links to this chapter's in-body headings (depth >= 2 -- the chapter's own
 * title heading is already shown large at the top of the reading column, so
 * repeating it here would just link back to the top of the page). Built
 * from `heading`-type Blocks only, already filtered by visibility upstream
 * (see page.tsx) -- headings are always public content, but reusing the
 * same filtered list keeps this in lockstep with what's actually rendered.
 */
export function OnThisPageNav({ items }: { items: OnThisPageItem[] }) {
  return (
    <div>
      <div className="mb-2.5 font-mono text-xs uppercase tracking-wide text-muted">
        On this page
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">No sections in this chapter yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 border-l border-border-subtle pl-3">
          {items.map((item) => (
            <li key={item.id} style={{ marginLeft: `${Math.max(item.depth - 2, 0) * 10}px` }}>
              <a
                href={`#${item.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToBlock(item.id);
                  window.history.replaceState(null, '', `#${item.id}`);
                }}
                className="block text-sm text-muted-foreground transition-colors hover:text-ink"
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
