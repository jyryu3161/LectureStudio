/**
 * Public API of the permission-aware Reading Mode renderer.
 *
 * `renderBlocks` is the main entry point: given a chapter's parsed Blocks
 * (see `@/lib/content`) and the viewer's course role, it returns the React
 * tree Reading Mode should render, with instructor-only content already
 * removed (see render-blocks.tsx for the security invariant this upholds).
 *
 * The lower-level rendering utilities are also exported for reuse by other
 * workstreams that need the same MyST-node-to-React/KaTeX/Shiki behavior
 * (e.g. an Authoring Studio live preview, or Lecture Mode).
 */
export { mystNodesToPlainText, renderMystNodes } from './mdast';
export { renderMath } from './katex';
export { highlightCode } from './shiki';
export { renderBlocks } from './render-blocks';
export type { RenderOptions } from './types';
