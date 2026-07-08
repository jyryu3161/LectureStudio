/**
 * MyST/mdast -> clean, valid XHTML serialization for the ePub export
 * (lib/export/epub.ts). Server-only in spirit (it consumes the Content
 * Engine's parsed Blocks) but has no runtime dependency that forbids test
 * use.
 *
 * SECURITY / EXPORT INVARIANT (PRD §5.6): `blocksToXhtmlBody` filters to
 * `visibility === 'public'` blocks ONLY, regardless of who requested the
 * export. `instructor-note` blocks (the sole `'instructor'`-visibility type,
 * see lib/content/blocks.ts `visibilityForBlockType`) are therefore stripped
 * here -- an export must never carry instructor-only content even for an
 * instructor/author requester. This mirrors the Reading renderer's
 * `filterByVisibility`, but is applied unconditionally (no role parameter)
 * because an export leaves the trust boundary.
 *
 * The serializer intentionally reimplements a small, hook-free subset of the
 * node types our content uses (the same rationale as lib/render/mdast.tsx:
 * myst-to-react's renderers require a client React context and cannot run
 * server-side). Unknown node types degrade gracefully (children -> raw text
 * -> nothing) rather than throwing, so one exotic node never blanks a
 * chapter.
 */
import type { GenericNode } from 'myst-common';

import type { Block } from '@/lib/content';
import { findCaptionNodes, findCodeNode, findImageNodes } from '@/lib/render/block-nodes';

/** Escape text content for XML/XHTML (&, <, >). */
export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape an attribute value (adds quote escaping on top of text escaping). */
export function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

const HEADING_TAGS = ['h1', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

/** Extract a heading depth (1..6) from a block, preferring denormalized metadata. */
function headingDepth(block: Block): number {
  const metaDepth = block.metadata.depth;
  const raw = typeof metaDepth === 'number' ? metaDepth : block.node.depth;
  const depth = typeof raw === 'number' ? raw : 2;
  return Math.min(6, Math.max(1, depth));
}

/** Pull the LaTeX text out of an equation-typed block (bare `math` or `:::equation`). */
function equationLatex(node: GenericNode): string {
  if (node.type === 'math' && typeof node.value === 'string') return node.value;
  // `:::equation` wraps parsed MyST; find the first math/inlineMath descendant.
  let found = '';
  const walk = (n: GenericNode): void => {
    if (found) return;
    if ((n.type === 'math' || n.type === 'inlineMath') && typeof n.value === 'string') {
      found = n.value;
      return;
    }
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(node);
  return found || plainText(node);
}

/** Flatten a node subtree to plain text (fallback only). */
function plainText(node: GenericNode): string {
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) return node.children.map(plainText).join('');
  return '';
}

/** Serialize a list of sibling nodes to an XHTML string. */
function serializeNodes(nodes: GenericNode[] | null | undefined): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes.map(serializeNode).join('');
}

/** Serialize a single inline/block node to an XHTML string. */
function serializeNode(node: GenericNode): string {
  switch (node.type) {
    case 'text':
      return typeof node.value === 'string' ? escapeText(node.value) : '';

    case 'paragraph':
      return `<p>${serializeNodes(node.children)}</p>`;

    case 'emphasis':
      return `<em>${serializeNodes(node.children)}</em>`;

    case 'strong':
      return `<strong>${serializeNodes(node.children)}</strong>`;

    case 'delete':
      return `<del>${serializeNodes(node.children)}</del>`;

    case 'subscript':
      return `<sub>${serializeNodes(node.children)}</sub>`;

    case 'superscript':
      return `<sup>${serializeNodes(node.children)}</sup>`;

    case 'inlineCode':
      return `<code>${escapeText(typeof node.value === 'string' ? node.value : '')}</code>`;

    case 'link': {
      const href = typeof node.url === 'string' ? node.url : '#';
      return `<a href="${escapeAttr(href)}">${serializeNodes(node.children)}</a>`;
    }

    case 'break':
      return '<br/>';

    case 'thematicBreak':
      return '<hr/>';

    case 'blockquote':
      return `<blockquote>${serializeNodes(node.children)}</blockquote>`;

    case 'list': {
      const tag = node.ordered === true ? 'ol' : 'ul';
      return `<${tag}>${serializeNodes(node.children)}</${tag}>`;
    }

    case 'listItem':
      return `<li>${serializeNodes(node.children)}</li>`;

    // Equations render as LaTeX source in <code> (kept simple + valid XHTML;
    // no MathML dependency). Block math gets a <pre> wrapper, inline stays inline.
    case 'inlineMath':
      return `<code class="ls-math-inline">${escapeText(typeof node.value === 'string' ? node.value : '')}</code>`;

    case 'math':
      return `<pre class="ls-math"><code>${escapeText(typeof node.value === 'string' ? node.value : '')}</code></pre>`;

    case 'image': {
      const src = typeof node.url === 'string' ? node.url : '';
      const alt = typeof node.alt === 'string' ? node.alt : '';
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"/>`;
    }

    case 'code':
      return `<pre><code>${escapeText(typeof node.value === 'string' ? node.value : '')}</code></pre>`;

    // Stable-id marker comments, raw HTML and MyST comments are never content.
    case 'html':
    case 'comment':
    case 'mystComment':
      return '';

    default:
      if (Array.isArray(node.children)) return serializeNodes(node.children);
      if (typeof node.value === 'string') return escapeText(node.value);
      return '';
  }
}

/** Serialize a figure block: image(s) + optional caption. */
function serializeFigure(node: GenericNode): string {
  const images = findImageNodes(node)
    .map((img) => serializeNode(img))
    .join('');
  const caption = serializeNodes(findCaptionNodes(node));
  const inner = images || serializeNodes(node.children);
  return `<figure>${inner}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
}

/** Serialize a code block (bare or `:::code` container) with optional caption. */
function serializeCode(node: GenericNode): string {
  const codeNode = findCodeNode(node);
  const value = codeNode && typeof codeNode.value === 'string' ? codeNode.value : '';
  const caption = serializeNodes(findCaptionNodes(node));
  return `<pre><code>${escapeText(value)}</code></pre>${
    caption ? `<figcaption>${caption}</figcaption>` : ''
  }`;
}

/** Placeholder for dynamic/interactive blocks that cannot render in a static ePub. */
function serializeEmbedPlaceholder(node: GenericNode, label: string): string {
  const caption = serializeNodes(node.children);
  return `<div class="ls-embed">${caption || ''}<p class="ls-embed-note">[${escapeText(
    label,
  )}]</p></div>`;
}

/**
 * Serialize a single Block to XHTML, dispatching on its PRD §5.5 block type.
 * Callers must have already filtered out non-public blocks (see
 * `blocksToXhtmlBody`); an `instructor-note` reaching here still returns
 * empty as a defensive backstop.
 */
export function serializeBlock(block: Block): string {
  switch (block.blockType) {
    case 'heading': {
      const tag = HEADING_TAGS[headingDepth(block)];
      return `<${tag}>${serializeNodes(block.node.children)}</${tag}>`;
    }

    case 'equation':
      return `<pre class="ls-math"><code>${escapeText(equationLatex(block.node))}</code></pre>`;

    case 'code':
    case 'code-output':
      return serializeCode(block.node);

    case 'figure':
      return serializeFigure(block.node);

    case 'lecture-summary':
      return `<aside class="ls-summary"><p class="ls-label">요약</p>${serializeNodes(
        block.node.children,
      )}</aside>`;

    case 'student-detail':
      return `<div class="ls-detail">${serializeNodes(block.node.children)}</div>`;

    // Never emitted for a public export (filtered upstream) -- defensive only.
    case 'instructor-note':
      return '';

    case 'interactive-demo':
      return serializeEmbedPlaceholder(block.node, '대화형 데모는 온라인 버전에서 확인할 수 있습니다');

    case 'video':
      return serializeEmbedPlaceholder(block.node, '동영상은 온라인 버전에서 확인할 수 있습니다');

    case 'animation':
      return serializeEmbedPlaceholder(block.node, '애니메이션은 온라인 버전에서 확인할 수 있습니다');

    case 'quiz':
      return serializeEmbedPlaceholder(block.node, '퀴즈는 온라인 버전에서 확인할 수 있습니다');

    default:
      // paragraph and anything blockTypeOf() mapped to it (lists, blockquotes,
      // thematic breaks): serialize the node itself.
      return serializeNode(block.node);
  }
}

/**
 * Serialize a chapter's Blocks to an XHTML body fragment, filtered to
 * STUDENT-visible (public) content only -- the export invariant (PRD §5.6).
 * This filter is unconditional and role-independent by design.
 */
export function blocksToXhtmlBody(blocks: Block[]): string {
  return blocks
    .filter((block) => block.visibility === 'public')
    .map(serializeBlock)
    .filter((html) => html.length > 0)
    .join('\n');
}
