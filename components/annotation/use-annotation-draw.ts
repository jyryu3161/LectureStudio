'use client';

import { useCallback, useRef, useState } from 'react';

import type { NewAnnotation } from '@/lib/annotations/types';

import {
  type BlockRect,
  type ContainerPoint,
  type HitTestStroke,
  type NormalizedPoint,
  hitTestStrokes,
  normalizePoint,
  assignBlock,
  segmentStroke,
} from './geometry';
import { ERASER_HIT_RADIUS_PX, HIGHLIGHTER_OPACITY, HIGHLIGHTER_WIDTH_MULTIPLIER } from './types';
import type { AnnotationStyle, AnnotationTool, ToolSettings } from './types';

/** A group of strokes deleted together (whole original stroke). */
export interface TextPlacement {
  blockId: string;
  contentHash: string;
  /** Block-normalized (0..1) position of the caret. */
  position: NormalizedPoint;
  /** Container-px position, for positioning the input box. */
  pagePosition: ContainerPoint;
}

export interface UseAnnotationDrawOptions {
  /** Positioned container holding the `[data-block-id]` sections. */
  container: HTMLElement | null;
  tool: AnnotationTool;
  toolSettings: ToolSettings;
  /** Fresh block boxes (from useBlockRects); read at pointer-up for segmentation. */
  rects: BlockRect[];
  /** Currently-rendered strokes, for eraser hit-testing. */
  strokes: HitTestStroke[];
  onCommitStroke: (drafts: NewAnnotation[]) => void;
  onErase: (groupId: string) => void;
  onPlaceText: (placement: TextPlacement) => void;
}

export interface UseAnnotationDrawResult {
  /** Spread onto the full-stage capture layer div. */
  captureProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onPointerLeave: (e: React.PointerEvent) => void;
  };
  /** In-progress pen/highlighter points (container px) for live preview. */
  livePoints: ContainerPoint[] | null;
  /** Ephemeral laser position (container px), never persisted. */
  laser: ContainerPoint | null;
  /** True while a tool wants to capture pointer events. */
  active: boolean;
}

function toContainerPoint(e: React.PointerEvent, container: HTMLElement): ContainerPoint {
  const box = container.getBoundingClientRect();
  return {
    x: e.clientX - box.left + container.scrollLeft,
    y: e.clientY - box.top + container.scrollTop,
  };
}

/**
 * Build the per-block `NewAnnotation` inserts for a finished pen/highlighter
 * stroke. Every segment shares one client-generated `group_id` so the eraser
 * can later remove the whole stroke as a unit (PRD §8.7). Only the fields the
 * client is trusted to supply are set — the server derives course/chapter/
 * session/author from the session + authenticated user (see the contract).
 * A client `id` per segment keeps the batch upsert idempotent across retries.
 */
function strokeToDrafts(
  points: ContainerPoint[],
  rects: BlockRect[],
  tool: 'pen' | 'highlighter',
  settings: ToolSettings,
): NewAnnotation[] {
  const segments = segmentStroke(points, rects);
  if (segments.length === 0) return [];
  const groupId = crypto.randomUUID();

  const style: AnnotationStyle =
    tool === 'highlighter'
      ? {
          color: settings.color,
          width: settings.width * HIGHLIGHTER_WIDTH_MULTIPLIER,
          opacity: HIGHLIGHTER_OPACITY,
        }
      : { color: settings.color, width: settings.width };

  return segments.map((segment): NewAnnotation => ({
    id: crypto.randomUUID(),
    block_id: segment.blockId,
    annotation_type: tool,
    created_against_hash: segment.contentHash,
    data: { points: segment.points, group_id: groupId },
    style,
  }));
}

/**
 * Pointer-driven drawing controller for the capture layer. Handles the four
 * pointer tools:
 *   - pen / highlighter: accumulate a stroke, segment it per block on pointer
 *     up, emit `NewAnnotation[]` sharing a group id;
 *   - eraser: hit-test the pointer against rendered strokes and emit a delete
 *     for the whole matched group;
 *   - laser: track an ephemeral local dot (never persisted).
 */
export function useAnnotationDraw(options: UseAnnotationDrawOptions): UseAnnotationDrawResult {
  const { container, tool, toolSettings, rects, strokes } = options;
  const [livePoints, setLivePoints] = useState<ContainerPoint[] | null>(null);
  const [laser, setLaser] = useState<ContainerPoint | null>(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef<ContainerPoint[]>([]);
  const pointerIdRef = useRef<number | null>(null);
  const erasedRef = useRef<Set<string>>(new Set());

  const isStrokeTool = tool === 'pen' || tool === 'highlighter';
  const active = tool !== null;

  const eraseAt = useCallback(
    (point: ContainerPoint) => {
      const rectsById = new Map<string, BlockRect>();
      for (const rect of rects) rectsById.set(rect.blockId, rect);
      const hit = hitTestStrokes(point, strokes, rectsById, ERASER_HIT_RADIUS_PX);
      if (hit && !erasedRef.current.has(hit)) {
        erasedRef.current.add(hit);
        options.onErase(hit);
      }
    },
    [rects, strokes, options],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!container || tool === null) return;
      e.preventDefault();
      const point = toContainerPoint(e, container);
      pointerIdRef.current = e.pointerId;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* pointer capture is best-effort */
      }

      if (tool === 'text') {
        const block = assignBlock(point, rects);
        if (block) {
          options.onPlaceText({
            blockId: block.blockId,
            contentHash: block.contentHash,
            position: normalizePoint(point, block),
            pagePosition: point,
          });
        }
        return;
      }

      if (tool === 'laser') {
        setLaser(point);
        drawingRef.current = true;
        return;
      }

      if (tool === 'eraser') {
        drawingRef.current = true;
        erasedRef.current = new Set();
        eraseAt(point);
        return;
      }

      // pen | highlighter
      drawingRef.current = true;
      pointsRef.current = [point];
      setLivePoints([point]);
    },
    [container, tool, rects, options, eraseAt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!container || !drawingRef.current) return;
      const point = toContainerPoint(e, container);

      if (tool === 'laser') {
        setLaser(point);
        return;
      }
      if (tool === 'eraser') {
        eraseAt(point);
        return;
      }
      if (isStrokeTool) {
        pointsRef.current.push(point);
        setLivePoints(pointsRef.current.slice());
      }
    },
    [container, tool, isStrokeTool, eraseAt],
  );

  const finishStroke = useCallback(() => {
    if (isStrokeTool && pointsRef.current.length > 0) {
      const drafts = strokeToDrafts(
        pointsRef.current,
        rects,
        tool as 'pen' | 'highlighter',
        toolSettings,
      );
      if (drafts.length > 0) options.onCommitStroke(drafts);
    }
    pointsRef.current = [];
    setLivePoints(null);
    drawingRef.current = false;
    erasedRef.current = new Set();
    pointerIdRef.current = null;
  }, [isStrokeTool, rects, tool, toolSettings, options]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drawingRef.current) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (tool === 'laser') {
        setLaser(null);
        drawingRef.current = false;
        return;
      }
      finishStroke();
    },
    [tool, finishStroke],
  );

  const onPointerCancel = useCallback(() => {
    // Abort in progress work without committing (avoids half-strokes on
    // interruption), but do NOT drop already-committed ink.
    pointsRef.current = [];
    setLivePoints(null);
    setLaser(null);
    drawingRef.current = false;
    erasedRef.current = new Set();
  }, []);

  const onPointerLeave = useCallback(() => {
    if (tool === 'laser') setLaser(null);
  }, [tool]);

  return {
    captureProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave },
    livePoints,
    laser,
    active,
  };
}
