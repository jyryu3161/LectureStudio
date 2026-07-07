import { Clapperboard, FlaskConical, HelpCircle, Sparkles, type LucideIcon } from 'lucide-react';

import type { BlockType } from '@/lib/content';

const STUB_META: Partial<Record<BlockType, { label: string; icon: LucideIcon }>> = {
  video: { label: 'Video', icon: Clapperboard },
  animation: { label: 'Animation', icon: Sparkles },
  'interactive-demo': { label: 'Interactive Demo', icon: FlaskConical },
  quiz: { label: 'Check Question', icon: HelpCircle },
};

/**
 * Stub placeholder for the MVP0 stub-only block types (PRD §4.7 / §5.5):
 * `video`, `animation`, `interactive-demo`, `quiz`. No authoring syntax
 * registers these yet, but a labeled, type-preserving placeholder keeps the
 * block's position in the chapter honest instead of silently dropping it.
 */
export function ComingSoonBlock({ blockType }: { blockType: BlockType }) {
  const meta = STUB_META[blockType] ?? { label: blockType, icon: HelpCircle };
  const Icon = meta.icon;

  return (
    <div className="mb-7 flex items-center gap-3 rounded-md border border-dashed border-border bg-canvas/60 px-5 py-4 text-muted-foreground">
      <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
      <div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.09em]">{meta.label}</div>
        <div className="mt-0.5 text-sm">Coming soon</div>
      </div>
    </div>
  );
}
