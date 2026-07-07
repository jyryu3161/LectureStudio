'use client';

import { useCallback, useEffect, useState } from 'react';

import type { BlockRect } from './geometry';

/**
 * Measures every `[data-block-id]` section inside `container` in container-local
 * pixel space and keeps the measurements fresh across layout changes.
 *
 * Overlays are drawn from block-normalized (0..1) coordinates scaled by these
 * boxes, so remeasuring on resize is exactly what keeps annotations glued to
 * their blocks (PRD requirement — verified). We remeasure on:
 *   - window resize,
 *   - a ResizeObserver on the container and on each block section (reflow,
 *     font load, image load, block content edits),
 *   - the caller bumping `revision` (e.g. after annotations/props change).
 *
 * The container is assumed to be a positioned element (`position: relative`);
 * rects are returned relative to its top-left so an `inset-0` overlay aligns.
 */
export function useBlockRects(
  container: HTMLElement | null,
  revision = 0,
): { rects: BlockRect[]; remeasure: () => void } {
  const [rects, setRects] = useState<BlockRect[]>([]);

  const remeasure = useCallback(() => {
    if (!container) {
      setRects([]);
      return;
    }
    const containerBox = container.getBoundingClientRect();
    const sections = container.querySelectorAll<HTMLElement>('[data-block-id]');
    const next: BlockRect[] = [];
    sections.forEach((section) => {
      const blockId = section.getAttribute('data-block-id');
      if (!blockId) return;
      const box = section.getBoundingClientRect();
      next.push({
        blockId,
        contentHash: section.getAttribute('data-content-hash') ?? '',
        left: box.left - containerBox.left + container.scrollLeft,
        top: box.top - containerBox.top + container.scrollTop,
        width: box.width,
        height: box.height,
      });
    });
    setRects((prev) => (rectsEqual(prev, next) ? prev : next));
  }, [container]);

  useEffect(() => {
    remeasure();
  }, [remeasure, revision]);

  useEffect(() => {
    if (!container) return;
    if (typeof window === 'undefined') return;

    const onResize = () => remeasure();
    window.addEventListener('resize', onResize);

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => remeasure());
      observer.observe(container);
      container.querySelectorAll<HTMLElement>('[data-block-id]').forEach((section) => {
        observer?.observe(section);
      });
    }

    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [container, remeasure]);

  return { rects, remeasure };
}

function rectsEqual(a: BlockRect[], b: BlockRect[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.blockId !== y.blockId ||
      x.contentHash !== y.contentHash ||
      x.left !== y.left ||
      x.top !== y.top ||
      x.width !== y.width ||
      x.height !== y.height
    ) {
      return false;
    }
  }
  return true;
}
