import { ChevronDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Static placeholder for the Lecture Mode session picker (PRD §7.3/§8.9):
 * choosing which public lecture session's annotations to overlay while
 * reading. There is no `lecture_sessions` table or annotation data yet
 * (arrives in Loop 2/MVP1) -- this previews the control's location and
 * interaction shape without claiming a real session exists.
 *
 * `DropdownMenu*` (components/ui/dropdown-menu.tsx) are already
 * `'use client'` modules, so this composing component can stay a plain
 * server component -- no client boundary of its own needed.
 */
export function SessionSelector() {
  return (
    <div>
      <div className="mb-2.5 font-mono text-xs uppercase tracking-wide text-muted">
        Lecture annotations
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2 text-left text-sm text-ink outline-none transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-accent">
          <span className="truncate text-muted-foreground">No published sessions yet</span>
          <ChevronDown size={15} className="shrink-0 text-muted" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[260px]">
          <DropdownMenuItem disabled>Lecture sessions arrive in Loop 2</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
