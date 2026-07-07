import type { GenericNode } from 'myst-common';

import { renderMystNodes } from '@/lib/render/mdast';

const DEPTH_CLASS = {
  1: 'text-[28px] sm:text-[32px] font-medium',
  2: 'text-2xl font-medium',
  3: 'text-xl font-semibold',
  4: 'text-lg font-semibold',
  5: 'text-base font-semibold',
  6: 'text-base font-semibold',
} as const;

type Depth = keyof typeof DEPTH_CLASS;

function toDepth(value: unknown): Depth {
  return typeof value === 'number' && value >= 1 && value <= 6 ? (value as Depth) : 2;
}

/** Chapter-body `heading` block (PRD §5.5) -- also how in-chapter sections are expressed. */
export function HeadingBlock({ node, keyPrefix }: { node: GenericNode; keyPrefix: string }) {
  const depth = toDepth(node.depth);
  const Tag = `h${depth}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

  return (
    <Tag className={`font-serif leading-tight tracking-tight text-ink ${DEPTH_CLASS[depth]}`}>
      {renderMystNodes(node.children, keyPrefix)}
    </Tag>
  );
}
