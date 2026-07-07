import { Lock } from 'lucide-react';

import type { BlockSummary } from '@/components/authoring/types';
import { ExecutableToggle } from '@/components/execution/executable-toggle';
import { cn } from '@/lib/utils';
import type { BlockType } from '@/lib/content';

const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  'lecture-summary': 'Lecture Summary',
  'student-detail': 'Student Detail',
  'instructor-note': 'Instructor Note',
  equation: 'Equation',
  figure: 'Figure',
  code: 'Code',
  'code-output': 'Code Output',
  video: 'Video',
  animation: 'Animation',
  'interactive-demo': 'Interactive Demo',
  quiz: 'Check Question',
};

/**
 * Read-only Block Inspector (PRD §6.1): lists every top-level block parsed
 * from the current (possibly unsaved) editor source, with its type and
 * whether it's student-visible or instructor-only. MVP0 scope is a
 * readout only -- no block controls (type change, reordering, asset
 * linking) yet.
 */
export function BlockInspector({ blocks }: { blocks: BlockSummary[] }) {
  if (blocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="font-mono text-xs text-muted-foreground">
          No blocks parsed yet — start writing in the editor.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {blocks.map((block) => (
        <li key={block.id} className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 w-6 shrink-0 font-mono text-[11px] text-muted-foreground">
            {String(block.order + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-canvas px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-ink">
                {BLOCK_TYPE_LABEL[block.blockType] ?? block.blockType}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide',
                  block.visibility === 'instructor'
                    ? 'bg-[#e5a34d]/[0.15] text-[#8a5a11]'
                    : 'bg-accent/10 text-accent',
                )}
              >
                {block.visibility === 'instructor' && (
                  <Lock size={10} strokeWidth={2.25} aria-hidden="true" />
                )}
                {block.visibility === 'instructor' ? 'Instructor-only' : 'Student-visible'}
              </span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">{block.id}</span>
            </div>
            {block.preview && <p className="mt-1.5 truncate text-sm text-ink/80">{block.preview}</p>}
            {block.blockType === 'code' && <ExecutableToggle blockId={block.id} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
