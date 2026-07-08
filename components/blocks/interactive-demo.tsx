import { FlaskConical } from 'lucide-react';

import type { Block } from '@/lib/content';
import { resolveDemoEmbed } from '@/lib/demos/embed';
import { renderMystNodes } from '@/lib/render/mdast';

/**
 * `interactive-demo` block (MVP4, PRD §4.7 / §5.5). Resolves the marimo app id
 * carried in `block.metadata.appId` (parsed from `:::{interactive-demo}
 * <appId>` in lib/content) to its public WASM bundle and embeds it in a
 * SANDBOXED iframe.
 *
 * SECURITY (non-negotiable): sandbox="allow-scripts allow-downloads" — the
 * WASM notebook needs to run JS (Pyodide from a CDN) and offer downloads, but
 * `allow-same-origin` is deliberately OMITTED so the untrusted, author-authored
 * demo can never read this app's cookies/storage or reach same-origin
 * endpoints. Execution is entirely client-side in the browser sandbox; there
 * is no server code path here.
 *
 * Async Server Component: `resolveDemoEmbed` reads the demo's readiness with a
 * trusted service-role client (see lib/demos/embed.ts) so the embed resolves
 * for any viewer, students included, while returning nothing sensitive.
 * Unknown id / not-yet-built / failed → a labeled "데모 준비 중" placeholder.
 */
export async function InteractiveDemoBlock({ block }: { block: Block }) {
  const appId = typeof block.metadata.appId === 'string' ? block.metadata.appId.trim() : '';
  const captionNodes = Array.isArray(block.node.children) ? block.node.children : [];
  const embed = appId ? await resolveDemoEmbed(appId) : null;

  if (!embed) {
    return (
      <div
        className="mb-7 flex items-center gap-3 rounded-md border border-dashed border-border bg-canvas/60 px-5 py-4 text-muted-foreground"
        role="note"
      >
        <FlaskConical size={18} strokeWidth={1.7} aria-hidden="true" />
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.09em]">Interactive Demo</div>
          <div className="mt-0.5 text-sm">데모 준비 중</div>
        </div>
      </div>
    );
  }

  return (
    <figure className="mb-7">
      <div className="relative w-full overflow-hidden rounded-md border border-border bg-paper aspect-[16/10]">
        <iframe
          src={embed.url}
          title={embed.name}
          loading="lazy"
          sandbox="allow-scripts allow-downloads"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
      {captionNodes.length > 0 ? (
        <figcaption className="mt-2.5 text-center font-sans text-[13px] text-muted-foreground">
          {renderMystNodes(captionNodes, `${block.id}-caption`)}
        </figcaption>
      ) : (
        <figcaption className="mt-2.5 text-center font-sans text-[13px] text-muted-foreground">
          {embed.name}
        </figcaption>
      )}
    </figure>
  );
}
