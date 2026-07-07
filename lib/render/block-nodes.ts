import type { GenericNode } from 'myst-common';

/**
 * Shared helpers for pulling the meaningful sub-node(s) out of the two
 * "wrapper" shapes myst-directives produces for figure/code blocks (see
 * node_modules/myst-directives/dist/{figure,code}.js's `run()`):
 *
 *  - a bare `code`/`image` node (plain fenced code, or a plain `![]()`
 *    image) IS the content -- no wrapping.
 *  - `:::{figure}`/`:::{code}` (with a `caption` option) instead produce a
 *    `container` node whose `kind` is `'figure'`/`'code'`, holding the real
 *    `image`/`code` child plus, for `code`, an explicit sibling `caption`
 *    node. The built-in `figure` directive does NOT wrap its caption in a
 *    `caption` node -- it pushes the parsed body straight into `children`
 *    alongside the image (verified against figure.js's `run()`), so figure
 *    captions are "whatever isn't the image" instead.
 *
 * Both `lib/render/render-blocks.tsx` (to precompute Shiki HTML up front)
 * and `components/blocks/{code,figure}.tsx` (to render) need the same
 * unwrapping, so it lives here once rather than being duplicated.
 */

/** The `code` node for a `code`-typed Block, whichever of the two shapes it is. */
export function findCodeNode(node: GenericNode): GenericNode | null {
  if (node.type === 'code') return node;
  if (node.type === 'container' && Array.isArray(node.children)) {
    return node.children.find((child) => child.type === 'code') ?? null;
  }
  return null;
}

/** Every `image` node for a `figure`-typed Block (usually exactly one). */
export function findImageNodes(node: GenericNode): GenericNode[] {
  if (node.type === 'image') return [node];
  if (Array.isArray(node.children)) {
    return node.children.filter((child) => child.type === 'image');
  }
  return [];
}

/** The caption content (as further MyST nodes) for a `figure`/`code` container, if any. */
export function findCaptionNodes(node: GenericNode): GenericNode[] {
  if (node.type !== 'container' || !Array.isArray(node.children)) return [];
  const explicitCaption = node.children.find((child) => child.type === 'caption');
  if (explicitCaption) return explicitCaption.children ?? [];
  return node.children.filter((child) => child.type !== 'image');
}
