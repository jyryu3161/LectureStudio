import { Lock } from 'lucide-react';
import type { GenericNode } from 'myst-common';

import { renderMystNodes } from '@/lib/render/mdast';

/**
 * `instructor-note` block (PRD §5.5 / §5.6 / §15.3): instructor-only
 * teaching notes.
 *
 * SECURITY: this component must only ever be reached for a privileged role
 * (author/instructor/admin). `renderBlocks` (lib/render/render-blocks.tsx)
 * strips every `visibility: 'instructor'` block out of the block list up
 * front -- before any component in this tree is constructed -- via the same
 * `filterByVisibility` helper (lib/auth/guards.ts) the rest of the app uses.
 * This component does not, and cannot, re-check the viewer's role; it
 * relies entirely on never being handed instructor content in the first
 * place. Styling is deliberately distinct (dashed amber border + lock icon)
 * so instructor-only content is unmistakable even to a privileged viewer.
 */
export function InstructorNoteBlock({ node, keyPrefix }: { node: GenericNode; keyPrefix: string }) {
  return (
    <div className="mb-7 rounded-lg border border-dashed border-[#e5a34d] bg-[#e5a34d]/[0.08] px-5 py-4">
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.09em] text-[#b3781f]">
        <Lock size={11} strokeWidth={2.25} aria-hidden="true" />
        Instructor Note &middot; not visible to students
      </div>
      <div className="font-serif text-[18px] leading-[1.55] text-ink">
        {renderMystNodes(node.children, keyPrefix)}
      </div>
    </div>
  );
}
