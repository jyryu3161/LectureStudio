import { Fragment, type ReactNode } from 'react';
import type { GenericNode } from 'myst-common';

import { cn } from '@/lib/utils';

import { renderMath } from './katex';

/**
 * Hand-rolled MyST/mdast -> React renderer for the inline and lightweight
 * block-level node types that show up inside a Block's body content
 * (paragraph runs; the nested markdown MyST parses inside a directive body
 * for lecture-summary/student-detail/instructor-note; figure/code captions).
 *
 * This deliberately does NOT reuse myst-to-react's `<MyST/>` component tree.
 * Every renderer in that package (see
 * node_modules/myst-to-react/dist/MyST.js) calls `useNodeRenderers()`, a
 * React Context hook from `@myst-theme/providers`
 * (node_modules/@myst-theme/providers/dist/theme.js), with no server-safe
 * entry point and no default export that works without a `<ThemeProvider>`
 * client-side ancestor. Rendering it from a Server Component throws (hooks
 * require a Client Component's dispatcher), and wrapping it in a
 * `'use client'` boundary is exactly what "never import myst-* from a
 * 'use client' component" forbids. So instead this implements the small
 * subset of node types our content actually needs as plain, hook-free,
 * server-safe recursion.
 *
 * Unknown/unsupported node types degrade gracefully (render their children,
 * or their raw text, or nothing) rather than throwing -- one exotic/future
 * node type must not blank out an entire chapter render.
 */

/** Renders a list of sibling MyST nodes. `keyPrefix` scopes React keys (pass the owning Block's stable id). */
export function renderMystNodes(nodes: GenericNode[] | null | undefined, keyPrefix: string): ReactNode {
  if (!nodes || nodes.length === 0) return null;
  return nodes.map((node, index) => (
    <Fragment key={`${keyPrefix}-${index}`}>{renderMystNode(node, `${keyPrefix}-${index}`)}</Fragment>
  ));
}

function renderMystNode(node: GenericNode, key: string): ReactNode {
  switch (node.type) {
    case 'text':
      return typeof node.value === 'string' ? node.value : null;

    case 'paragraph':
      return <p className="mb-[1.1em] last:mb-0">{renderMystNodes(node.children, key)}</p>;

    case 'emphasis':
      return <em>{renderMystNodes(node.children, key)}</em>;

    case 'strong':
      return <strong className="font-semibold">{renderMystNodes(node.children, key)}</strong>;

    case 'delete':
      return <del>{renderMystNodes(node.children, key)}</del>;

    case 'subscript':
      return <sub>{renderMystNodes(node.children, key)}</sub>;

    case 'superscript':
      return <sup>{renderMystNodes(node.children, key)}</sup>;

    case 'inlineCode':
      return (
        <code className="rounded bg-ink/[0.06] px-[0.35em] py-[0.05em] font-mono text-[0.88em]">
          {node.value}
        </code>
      );

    case 'link': {
      const href = typeof node.url === 'string' ? node.url : undefined;
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-hover"
        >
          {renderMystNodes(node.children, key)}
        </a>
      );
    }

    case 'break':
      return <br />;

    case 'thematicBreak':
      return <hr className="my-6 border-border" />;

    case 'blockquote':
      return (
        <blockquote className="border-l-2 border-border pl-4 italic text-muted-foreground">
          {renderMystNodes(node.children, key)}
        </blockquote>
      );

    case 'list': {
      const ordered = node.ordered === true;
      const ListTag = ordered ? 'ol' : 'ul';
      return (
        <ListTag className={cn('mb-[1.1em] ml-5 space-y-1 last:mb-0', ordered ? 'list-decimal' : 'list-disc')}>
          {renderMystNodes(node.children, key)}
        </ListTag>
      );
    }

    case 'listItem':
      return <li>{renderMystNodes(node.children, key)}</li>;

    case 'inlineMath':
      return typeof node.value === 'string' ? (
        <span dangerouslySetInnerHTML={{ __html: renderMath(node.value, false) }} />
      ) : null;

    case 'math':
      return typeof node.value === 'string' ? (
        <div className="my-4 overflow-x-auto text-center" dangerouslySetInnerHTML={{ __html: renderMath(node.value, true) }} />
      ) : null;

    // Raw HTML/comment passthrough nodes (including our own stable-id
    // marker comments, see lib/content/stable-ids.ts) are never content.
    case 'html':
    case 'comment':
    case 'mystComment':
      return null;

    default:
      // Best-effort passthrough for anything unrecognized (e.g. a table, an
      // admonition, or a future MyST feature): render children if there are
      // any, else raw text, else nothing. Never throw.
      if (Array.isArray(node.children)) return renderMystNodes(node.children, key);
      if (typeof node.value === 'string') return node.value;
      return null;
  }
}

/** Flattens a list of MyST nodes to plain text (e.g. for a figure's alt-text fallback). */
export function mystNodesToPlainText(nodes: GenericNode[] | null | undefined): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes
    .map((node) => {
      if (typeof node.value === 'string') return node.value;
      if (Array.isArray(node.children)) return mystNodesToPlainText(node.children);
      return '';
    })
    .join('')
    .trim();
}
