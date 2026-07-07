'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Layers, PenLine, Presentation, User } from 'lucide-react';

import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/reading', label: 'Reading Mode', icon: BookOpen, enabled: true },
  { href: '/lecture', label: 'Lecture Mode (coming soon)', icon: Presentation, enabled: false },
  { href: '/authoring', label: 'Authoring Studio', icon: PenLine, enabled: true },
  { href: '/admin', label: 'Admin Runtime Studio (coming soon)', icon: Layers, enabled: false },
] as const;

/**
 * The 66px dark app rail shared by every mode (Reading / Lecture / Authoring
 * / Admin). Matches the design tokens extracted from ref/design.zip.
 */
export function AppRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="flex w-[66px] shrink-0 flex-col items-center gap-1 bg-rail py-3.5"
    >
      <Link
        href="/"
        title="Lecture Studio"
        className="mb-3.5 flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-gradient-to-br from-white to-[#d9dbe6] shadow-[0_1px_0_rgba(255,255,255,.15)_inset]"
      >
        <span className="h-3 w-3 rotate-45 rounded-sm bg-rail" aria-hidden="true" />
      </Link>

      <ul className="flex w-full flex-col items-center gap-1.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon, enabled }) => {
          const isActive = pathname === href || pathname?.startsWith(`${href}/`);

          if (!enabled) {
            return (
              <li key={href} className="flex w-full justify-center">
                <span
                  title={label}
                  aria-disabled="true"
                  className="flex h-12 w-12 cursor-not-allowed items-center justify-center text-white/25"
                >
                  <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
                  <span className="sr-only">{label}</span>
                </span>
              </li>
            );
          }

          return (
            <li key={href} className="flex w-full justify-center">
              <Link
                href={href}
                title={label}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl text-white/40 transition-colors hover:text-white',
                  isActive && 'bg-white/10 text-white',
                )}
              >
                <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div
        className="mt-auto flex h-8 w-8 items-center justify-center rounded-full bg-[#3a3d45] text-[#cfd0d4]"
        aria-hidden="true"
      >
        <User size={16} strokeWidth={1.8} />
      </div>
    </nav>
  );
}
