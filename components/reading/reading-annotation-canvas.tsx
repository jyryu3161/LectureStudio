'use client';

import { useMemo, useRef, type ReactNode } from 'react';

import { AnnotationLayer } from '@/components/annotation';
import type { ToolSettings } from '@/components/annotation/types';
import type { AnnotationRow } from '@/lib/annotations/types';

import { useAnnotationOverlay } from './annotation-overlay-context';

// Read-only replay never draws, so tool settings are inert -- but the layer
// requires a value. Use a contract-palette default.
const READONLY_TOOL_SETTINGS: ToolSettings = { color: '#16181c', width: 2 };
const noop = () => {};

/**
 * Wraps the server-rendered chapter blocks in a positioned container and, when
 * a published session is selected and the overlay is toggled on, mounts the
 * shared {@link AnnotationLayer} in READ-ONLY mode:
 *
 *  - `tool={null}` -> the capture layer is inert and `pointer-events` pass
 *    through to the page, so text selection / links under the ink still work.
 *  - `onCreate`/`onErase` are no-ops and `onDiscard` is omitted, so a reader
 *    can neither draw nor delete a lecturer's annotations -- they only view.
 *  - `staleGroupIds` drives the drift badge: annotations whose
 *    `created_against_hash` no longer matches the block's current hash are
 *    dimmed and badged ('내용 변경됨'), never silently repositioned or hidden.
 *
 * Only ONE session's annotations are ever passed in (the page loads exactly the
 * selected session), so we never stack two sessions' ink.
 */
export function ReadingAnnotationCanvas({
  annotations,
  staleGroupIds,
  children,
}: {
  annotations: AnnotationRow[];
  staleGroupIds: string[];
  children: ReactNode;
}) {
  const { overlayVisible } = useAnnotationOverlay();
  const containerRef = useRef<HTMLDivElement>(null);
  const staleSet = useMemo(() => new Set(staleGroupIds), [staleGroupIds]);

  const showOverlay = overlayVisible && annotations.length > 0;

  return (
    <div ref={containerRef} className="relative">
      {children}
      {showOverlay && (
        <AnnotationLayer
          containerRef={containerRef}
          annotations={annotations}
          tool={null}
          toolSettings={READONLY_TOOL_SETTINGS}
          staleGroupIds={staleSet}
          onCreate={noop}
          onErase={noop}
        />
      )}
    </div>
  );
}
