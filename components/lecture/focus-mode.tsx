'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { ChevronLeft, ChevronRight, Minimize2 } from 'lucide-react';

/**
 * Focus Mode for Lecture Mode (PRD §8.3.2) — a block-by-block enlarged viewer
 * layered over the SAME server-rendered blocks. It is *not* a slide conversion:
 * we do not re-render or transform content, we simply present one
 * `<section data-block-id>` at a time, enlarged and centered, and dim/hide its
 * siblings.
 *
 * Why this keeps annotations correct without touching the annotation engine:
 * coordinates are stored *block-normalized* (0..1) against each block's live
 * measured box (see components/annotation/geometry + use-block-rects). Hidden
 * siblings collapse to zero-size, off-screen rects and therefore never win the
 * capture layer's nearest/contains block assignment, while the enlarged focused
 * block measures at its real (larger) box — so ink drawn while focused
 * normalizes against that block and re-scales proportionally when the presenter
 * returns to the full Live Book. Nothing in components/annotation changes.
 *
 * This component owns only DOM *decoration* (data attributes it adds itself,
 * which React never reconciles because they are not in any element's props) and
 * the focus-mode chrome (prev/next, position indicator, live-region
 * announcement). All visibility/enlargement is driven by the scoped CSS below.
 */

export interface FocusModeProps {
  active: boolean;
  /** The positioned `[data-annotation-root]` container holding the block sections. */
  containerRef: RefObject<HTMLElement | null>;
  /** Public block ids in document order. */
  blockOrder: string[];
  /** Index (into blockOrder) of the currently focused block. */
  index: number;
  /** Move to a specific block index (kept in range by the caller/handlers here). */
  onIndexChange: (index: number) => void;
  /** Exit focus mode (returns to the full Live Book). */
  onExit: () => void;
}

/** CSS.escape with a conservative fallback (older engines / SSR safety). */
function escapeAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

export function FocusMode({
  active,
  containerRef,
  blockOrder,
  index,
  onIndexChange,
  onExit,
}: FocusModeProps) {
  const total = blockOrder.length;
  const clampedIndex = total === 0 ? 0 : Math.min(Math.max(index, 0), total - 1);
  const focusedId = blockOrder[clampedIndex] ?? null;

  // When true, the next decorate pass moves keyboard focus onto the focused
  // section. Set on enter and on keyboard navigation, NOT on button clicks (so
  // repeated on-screen prev/next clicks don't yank focus off the button).
  const moveFocusRef = useRef(false);

  const goTo = useCallback(
    (next: number, fromKeyboard: boolean) => {
      if (total === 0) return;
      const bounded = Math.min(Math.max(next, 0), total - 1);
      if (bounded === clampedIndex) return;
      if (fromKeyboard) moveFocusRef.current = true;
      onIndexChange(bounded);
    },
    [total, clampedIndex, onIndexChange],
  );

  // --- Decorate the live sections: hide siblings, enlarge the focused one, and
  // (when navigation came from the keyboard) move focus onto it. -------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const sections = Array.from(
      container.querySelectorAll<HTMLElement>('[data-block-id]'),
    );

    if (!active) {
      // Restore: strip our decoration so the full Live Book renders normally.
      container.removeAttribute('data-focus-active');
      for (const section of sections) {
        section.removeAttribute('data-focus-block');
        if (section.dataset.focusTabindex === '1') {
          section.removeAttribute('tabindex');
          delete section.dataset.focusTabindex;
        }
      }
      return;
    }

    container.setAttribute('data-focus-active', 'true');
    let focusedEl: HTMLElement | null = null;
    for (const section of sections) {
      const id = section.getAttribute('data-block-id');
      const on = id !== null && id === focusedId;
      section.setAttribute('data-focus-block', on ? 'on' : 'off');
      if (on) {
        focusedEl = section;
        if (!section.hasAttribute('tabindex')) {
          section.setAttribute('tabindex', '-1');
          section.dataset.focusTabindex = '1';
        }
      }
    }

    if (focusedEl) {
      if (moveFocusRef.current) {
        moveFocusRef.current = false;
        focusedEl.focus({ preventScroll: true });
      }
      focusedEl.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }, [active, focusedId, containerRef]);

  // --- Keyboard navigation (only while focused). ---------------------------
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      // Never hijack typing (e.g. the annotation text input).
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goTo(clampedIndex + 1, true);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(clampedIndex - 1, true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onExit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, clampedIndex, goTo, onExit]);

  const atFirst = clampedIndex <= 0;
  const atLast = clampedIndex >= total - 1;

  return (
    <>
      <FocusModeStyle />

      {active && (
        <>
          {/* Position announcement for assistive tech (polite, off-screen). */}
          <div className="sr-only" role="status" aria-live="polite">
            {total > 0 ? `블록 ${clampedIndex + 1} / ${total}` : '블록 없음'}
          </div>

          {/* On-screen navigation chrome (hidden on print via data-lecture-chrome). */}
          <div
            data-lecture-chrome
            className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center"
          >
            <div
              role="group"
              aria-label="집중 모드 탐색"
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border-subtle bg-rail/95 px-2 py-1.5 text-white shadow-lg backdrop-blur"
            >
              <button
                type="button"
                onClick={() => goTo(clampedIndex - 1, false)}
                disabled={atFirst}
                aria-label="이전 블록"
                title="이전 블록 (←)"
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
              </button>

              <span
                className="min-w-[68px] text-center font-mono text-[13px] tabular-nums text-white/85"
                aria-hidden="true"
              >
                {total > 0 ? `${clampedIndex + 1} / ${total}` : '0 / 0'}
              </span>

              <button
                type="button"
                onClick={() => goTo(clampedIndex + 1, false)}
                disabled={atLast}
                aria-label="다음 블록"
                title="다음 블록 (→)"
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>

              <span className="mx-1 h-5 w-px bg-white/15" aria-hidden="true" />

              <button
                type="button"
                onClick={onExit}
                aria-label="집중 모드 종료"
                title="집중 모드 종료 (Esc)"
                className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <Minimize2 size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>종료</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Scoped CSS for Focus Mode (globals.css is frozen this loop, mirroring the
 * LectureChromeStyle pattern). Inert unless the annotation root carries
 * `data-focus-active`, so it is safe to render unconditionally.
 *
 * The focused block enlarges (wider measure + larger type) and centers in the
 * stage; siblings are removed from flow. The annotation overlay is
 * `position:absolute` (out of flow) so centering the single in-flow section
 * does not disturb it.
 */
function FocusModeStyle() {
  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
[data-annotation-root][data-focus-active] {
  display: flex !important;
  flex-direction: column;
  justify-content: center;
  min-height: 72vh;
}
[data-annotation-root][data-focus-active] [data-block-id][data-focus-block="off"] {
  display: none !important;
}
[data-annotation-root][data-focus-active] [data-block-id][data-focus-block="on"] {
  font-size: 1.3rem;
  line-height: 1.75;
  margin: 0 auto;
  width: 100%;
}
[data-annotation-root][data-focus-active] [data-block-id][data-focus-block="on"]:focus {
  outline: none;
}
[data-annotation-root][data-focus-active] [data-block-id][data-focus-block="on"]:focus-visible {
  outline: 2px solid var(--accent, #43507e);
  outline-offset: 6px;
  border-radius: 4px;
}
@media print {
  /* Focus chrome must never appear on exported PDFs. */
  [data-lecture-chrome] { display: none !important; }
}
`,
      }}
    />
  );
}
