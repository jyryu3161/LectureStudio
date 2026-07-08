import type { Block } from '@/lib/content';

import { CodeBlock } from './code';
import { CodeOutputBlock } from './code-output';
import { EquationBlock } from './equation';
import { FigureBlock } from './figure';
import { HeadingBlock } from './heading';
import { InstructorNoteBlock } from './instructor-note';
import { InteractiveDemoBlock } from './interactive-demo';
import { LectureSummaryBlock } from './lecture-summary';
import { ParagraphBlock } from './paragraph';
import { ComingSoonBlock } from './stub';
import { StudentDetailBlock } from './student-detail';

/**
 * Dispatches a single Block to its type-specific presentational component.
 * `codeHtml` is the Shiki-highlighted markup for a `code` block, precomputed
 * by `renderBlocks` (lib/render/render-blocks.tsx) -- `null` for every
 * other block type.
 */
export function BlockContent({ block, codeHtml }: { block: Block; codeHtml: string | null }) {
  const { node, blockType, id } = block;

  switch (blockType) {
    case 'heading':
      return <HeadingBlock node={node} keyPrefix={id} />;
    case 'paragraph':
      return <ParagraphBlock node={node} keyPrefix={id} />;
    case 'lecture-summary':
      return <LectureSummaryBlock node={node} keyPrefix={id} />;
    case 'student-detail':
      return <StudentDetailBlock node={node} keyPrefix={id} />;
    case 'instructor-note':
      return <InstructorNoteBlock node={node} keyPrefix={id} />;
    case 'equation':
      return <EquationBlock node={node} keyPrefix={id} />;
    case 'figure':
      return <FigureBlock node={node} keyPrefix={id} />;
    case 'code':
      return <CodeBlock node={node} keyPrefix={id} html={codeHtml} />;
    case 'code-output':
      return <CodeOutputBlock node={node} keyPrefix={id} />;
    case 'interactive-demo':
      return <InteractiveDemoBlock block={block} />;
    case 'video':
    case 'animation':
    case 'quiz':
      return <ComingSoonBlock blockType={blockType} />;
    default: {
      // Exhaustiveness guard: if `BlockType` ever grows a new member, this
      // fails `tsc --noEmit` here instead of silently rendering nothing.
      const exhaustiveCheck: never = blockType;
      return exhaustiveCheck;
    }
  }
}
