import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ParseWarning } from '@/lib/content';

export interface PreviewPaneProps {
  elements: ReactNode;
  /** Whether `elements` currently renders any block at all -- controls the empty-state copy. */
  hasContent: boolean;
  warnings: ParseWarning[];
  /** Set when the *last* debounced preview update failed -- `elements` below is still the last successful render. */
  fetchError?: string | null;
}

/**
 * The Authoring Studio's live Reading-mode preview (PRD §6.1). `elements`
 * is the actual rendered React tree -- Reading Mode's own block components,
 * server-executed with `role: 'author'` (see app/authoring/_lib/preview.ts
 * / lib/render/render-blocks.tsx) -- rendered directly rather than
 * serialized to an HTML string, so instructor-note content is visible here
 * by design, unlike the real student-facing render.
 */
export function PreviewPane({ elements, hasContent, warnings, fetchError }: PreviewPaneProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {fetchError && (
        <div className="flex shrink-0 items-start gap-2 border-b border-border-subtle bg-red-50 px-4 py-2.5 text-xs text-red-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Preview didn&rsquo;t update: {fetchError}. Showing the last successful render.</span>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="shrink-0 border-b border-border-subtle bg-[#fff8ec] px-4 py-2.5 text-xs text-[#8a5a11]">
          <p className="mb-1 font-mono text-[10.5px] uppercase tracking-wide">
            {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </p>
          <ul className="space-y-0.5">
            {warnings.map((warning, index) => (
              <li key={index}>
                {warning.line != null ? `Line ${warning.line}: ` : ''}
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex-1 overflow-y-auto bg-paper px-8 py-8">
        {hasContent ? (
          <div className="mx-auto max-w-2xl">{elements}</div>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            Nothing to preview yet — start writing in the editor.
          </p>
        )}
      </div>
    </div>
  );
}
