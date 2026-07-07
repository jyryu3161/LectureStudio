'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Client state shared between the right-panel session picker (the '판서 오버레이
 * 표시' toggle) and the reading-column overlay canvas, which live in separate
 * subtrees of the page. Session *selection* is URL-driven (server round-trip,
 * shareable) but overlay *visibility* is a purely local toggle so a reader can
 * flip the ink on/off instantly without a navigation.
 *
 * The provider is mounted once around the whole reading region and receives the
 * server-rendered blocks / TOC / notes as `children`, so those stay server
 * components -- this only adds a thin client boundary for the shared boolean.
 */
interface AnnotationOverlayContextValue {
  /** Whether the read-only annotation overlay is currently shown. */
  overlayVisible: boolean;
  setOverlayVisible: (visible: boolean) => void;
}

const AnnotationOverlayContext = createContext<AnnotationOverlayContextValue | null>(null);

export function AnnotationOverlayProvider({
  defaultVisible = true,
  children,
}: {
  defaultVisible?: boolean;
  children: ReactNode;
}) {
  const [overlayVisible, setOverlayVisible] = useState(defaultVisible);
  const value = useMemo(
    () => ({ overlayVisible, setOverlayVisible }),
    [overlayVisible],
  );
  return (
    <AnnotationOverlayContext.Provider value={value}>
      {children}
    </AnnotationOverlayContext.Provider>
  );
}

/**
 * Reads the shared overlay-visibility state. Returns a safe default when used
 * outside a provider (e.g. a future embedding) so a consumer never crashes the
 * page -- it simply behaves as "overlay on, toggle is a no-op".
 */
export function useAnnotationOverlay(): AnnotationOverlayContextValue {
  const ctx = useContext(AnnotationOverlayContext);
  if (!ctx) {
    return { overlayVisible: true, setOverlayVisible: () => {} };
  }
  return ctx;
}
