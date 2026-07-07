import type { GenericNode } from 'myst-common';

import { findCaptionNodes, findImageNodes } from '@/lib/render/block-nodes';
import { mystNodesToPlainText, renderMystNodes } from '@/lib/render/mdast';

/**
 * `figure` block (PRD §5.5 / §16.4): a static image. `alt` text is
 * required for accessibility -- the Content Engine already warns at parse
 * time when it is missing (lib/content/parse.ts's `checkFigureAltText`),
 * but a block can still reach the renderer without one (a warning does not
 * block ingestion). Rather than ever emit `alt=""` (which tells assistive
 * tech "purely decorative, skip me" -- wrong for real content), this falls
 * back to the figure's own caption text, and only then to a generic label,
 * so the `alt` attribute is never empty.
 */
export function FigureBlock({ node, keyPrefix }: { node: GenericNode; keyPrefix: string }) {
  const images = findImageNodes(node);
  const captionNodes = findCaptionNodes(node);
  const captionText = mystNodesToPlainText(captionNodes);

  if (images.length === 0) {
    // No image we can safely render (e.g. an unsupported sub-figure/
    // notebook-cell figure shape) -- degrade visibly instead of throwing.
    return (
      <figure className="mb-7">
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border bg-canvas font-mono text-xs text-muted-foreground">
          Figure content unavailable
        </div>
      </figure>
    );
  }

  return (
    <figure className="mb-7">
      <div className="flex flex-col gap-3">
        {images.map((image, index) => {
          const explicitAlt = typeof image.alt === 'string' ? image.alt.trim() : '';
          const alt = explicitAlt || captionText || 'Untitled figure';
          const src = typeof image.url === 'string' ? image.url : '';
          const title = typeof image.title === 'string' ? image.title : undefined;
          return (
            // Author-supplied URLs from arbitrary/unconfigured hosts -- next/image
            // requires allow-listing remote domains, so a plain <img> is used here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${keyPrefix}-img-${index}`}
              src={src}
              alt={alt}
              title={title}
              className="w-full rounded-md border border-border-subtle object-contain"
            />
          );
        })}
      </div>
      {captionNodes.length > 0 && (
        <figcaption className="mt-2.5 text-center font-sans text-[13px] text-muted-foreground">
          {renderMystNodes(captionNodes, `${keyPrefix}-caption`)}
        </figcaption>
      )}
    </figure>
  );
}
