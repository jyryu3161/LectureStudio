'use client';

import { useEffect, useState } from 'react';

function storageKey(chapterId: string): string {
  return `lecture-studio:notes:${chapterId}`;
}

/**
 * "My notes" (PRD §7.3 personal memo) -- local-only for MVP0: there is no
 * `personal_notes` table yet, so nothing here is synced to the account or
 * visible to anyone else. Persists to `localStorage`, keyed by chapter, so a
 * reload or navigating away and back doesn't silently discard what a
 * student typed -- an uncontrolled/in-memory-only textarea would otherwise
 * be a real data-loss trap for a "notes" feature.
 */
export function PersonalNotes({ chapterId }: { chapterId: string }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    try {
      setValue(window.localStorage.getItem(storageKey(chapterId)) ?? '');
    } catch {
      // Storage can throw in locked-down/private-browsing contexts -- fall
      // back to a blank, in-memory-only textarea rather than crash the page.
      setValue('');
    }
  }, [chapterId]);

  function handleChange(next: string) {
    setValue(next);
    try {
      window.localStorage.setItem(storageKey(chapterId), next);
    } catch {
      // Best-effort only -- see the read-side catch above.
    }
  }

  return (
    <div>
      <label
        htmlFor="reading-my-notes"
        className="mb-2.5 block font-mono text-xs uppercase tracking-wide text-muted"
      >
        My notes
      </label>
      <textarea
        id="reading-my-notes"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="Jot down a personal note for this chapter..."
        rows={6}
        className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
      />
      <p className="mt-1.5 text-[11px] text-muted">Saved privately in this browser only.</p>
    </div>
  );
}
