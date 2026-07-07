'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { AnnotationRow, NewAnnotation } from '@/lib/annotations/types';
import { cn } from '@/lib/utils';

import {
  type BlockRect,
  type HitTestStroke,
  type NormalizedPoint,
  pointsToPathData,
} from './geometry';
import { useAnnotationDraw, type TextPlacement } from './use-annotation-draw';
import { useBlockRects } from './use-block-rects';
import { HIGHLIGHTER_OPACITY, type AnnotationTool, type ToolSettings } from './types';

const STALE_OPACITY = 0.28;

export interface AnnotationLayerProps {
  /** The positioned (`position:relative`) container holding the block sections. */
  containerRef: RefObject<HTMLElement | null>;
  /** Persisted + optimistic annotations to render. */
  annotations: AnnotationRow[];
  tool: AnnotationTool;
  toolSettings: ToolSettings;
  /** Group ids whose block hash has drifted from `created_against_hash` (page-computed). */
  staleGroupIds?: Set<string>;
  /** Emitted with per-block `NewAnnotation` inserts when a stroke/text is created. */
  onCreate: (drafts: NewAnnotation[]) => void;
  /** Emitted with a group id when the eraser removes a whole stroke. */
  onErase: (groupId: string) => void;
  /** Discard a drifted (stale) stroke group. */
  onDiscard?: (groupId: string) => void;
  /** Bump to force a remeasure (e.g. after external layout changes). */
  revision?: number;
  className?: string;
}

interface RenderStroke {
  key: string;
  groupId: string;
  blockId: string;
  type: 'pen' | 'highlighter';
  points: NormalizedPoint[];
  color: string;
  width: number;
  stale: boolean;
}

interface RenderText {
  key: string;
  groupId: string;
  blockId: string;
  text: string;
  position: NormalizedPoint;
  color: string;
  stale: boolean;
}

function groupIdOf(annotation: AnnotationRow): string {
  const data = annotation.data as { group_id?: string };
  return data.group_id ?? annotation.id;
}

/**
 * The client annotation overlay: renders persisted + in-progress annotations as
 * per-block SVG overlays glued to their blocks, and — when a tool is active —
 * mounts a transparent full-stage capture layer that drives drawing, erasing,
 * the laser and text placement.
 *
 * Coordinates are stored block-normalized (0..1) and re-scaled from the blocks'
 * *current* measured boxes on every resize (via `useBlockRects` +
 * ResizeObserver), so ink stays anchored to its block across layout changes.
 * Drifted (stale) annotations are dimmed and badged, never silently hidden.
 */
export function AnnotationLayer({
  containerRef,
  annotations,
  tool,
  toolSettings,
  staleGroupIds,
  onCreate,
  onErase,
  onDiscard,
  revision = 0,
  className,
}: AnnotationLayerProps) {
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainerEl(containerRef.current);
  }, [containerRef]);

  const { rects } = useBlockRects(containerEl, revision + annotations.length);
  const rectsById = useMemo(() => {
    const map = new Map<string, BlockRect>();
    for (const rect of rects) map.set(rect.blockId, rect);
    return map;
  }, [rects]);

  // Split contract annotations into renderable strokes / texts.
  const { strokes, texts } = useMemo(() => {
    const s: RenderStroke[] = [];
    const t: RenderText[] = [];
    for (const a of annotations) {
      const gid = groupIdOf(a);
      const stale = staleGroupIds?.has(gid) ?? false;
      if (a.annotation_type === 'text') {
        const data = a.data as { text: string; position: NormalizedPoint };
        t.push({
          key: a.id,
          groupId: gid,
          blockId: a.block_id,
          text: data.text,
          position: data.position,
          color: a.style.color,
          stale,
        });
      } else {
        const data = a.data as { points: NormalizedPoint[] };
        s.push({
          key: a.id,
          groupId: gid,
          blockId: a.block_id,
          type: a.annotation_type,
          points: data.points ?? [],
          color: a.style.color,
          width: a.style.width,
          stale,
        });
      }
    }
    return { strokes: s, texts: t };
  }, [annotations, staleGroupIds]);

  const hitTestStrokeList = useMemo<HitTestStroke[]>(
    () => strokes.map((s) => ({ groupId: s.groupId, blockId: s.blockId, points: s.points })),
    [strokes],
  );

  const [textPlacement, setTextPlacement] = useState<TextPlacement | null>(null);
  const [textValue, setTextValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  const draw = useAnnotationDraw({
    container: containerEl,
    tool,
    toolSettings,
    rects,
    strokes: hitTestStrokeList,
    onCommitStroke: onCreate,
    onErase,
    onPlaceText: (placement) => {
      setTextValue('');
      setTextPlacement(placement);
    },
  });

  useEffect(() => {
    if (textPlacement) textInputRef.current?.focus();
  }, [textPlacement]);

  const commitText = () => {
    if (!textPlacement) return;
    const value = textValue.trim();
    if (value) {
      const draft: NewAnnotation = {
        id: crypto.randomUUID(),
        block_id: textPlacement.blockId,
        annotation_type: 'text',
        created_against_hash: textPlacement.contentHash,
        data: { text: value, position: textPlacement.position },
        style: { color: toolSettings.color, width: toolSettings.width },
      };
      onCreate([draft]);
    }
    setTextPlacement(null);
    setTextValue('');
  };

  const cursor =
    tool === 'eraser'
      ? 'cell'
      : tool === 'text'
        ? 'text'
        : tool === null
          ? 'auto'
          : 'crosshair';

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 z-20', className)}
      aria-hidden={tool === null}
    >
      {/* One SVG overlay per block, positioned + sized to the block's box. */}
      {rects.map((rect) => {
        const blockStrokes = strokes.filter((s) => s.blockId === rect.blockId);
        const blockTexts = texts.filter((tx) => tx.blockId === rect.blockId);
        if (blockStrokes.length === 0 && blockTexts.length === 0) return null;
        const local: BlockRect = { ...rect, left: 0, top: 0 };
        return (
          <svg
            key={rect.blockId}
            className="pointer-events-none absolute overflow-visible"
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            width={rect.width}
            height={rect.height}
          >
            {blockStrokes.map((s) => (
              <path
                key={s.key}
                d={pointsToPathData(s.points, local)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={s.stale ? STALE_OPACITY : s.type === 'highlighter' ? HIGHLIGHTER_OPACITY : 1}
                style={s.type === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
              />
            ))}
            {blockTexts.map((tx) => (
              <foreignObject
                key={tx.key}
                x={tx.position.x * rect.width}
                y={tx.position.y * rect.height}
                width={Math.max(40, rect.width - tx.position.x * rect.width)}
                height={40}
                opacity={tx.stale ? STALE_OPACITY : 1}
              >
                <div
                  className="font-sans text-sm leading-tight"
                  style={{ color: tx.color, fontFamily: 'var(--font-sans, sans-serif)' }}
                >
                  {tx.text}
                </div>
              </foreignObject>
            ))}
          </svg>
        );
      })}

      {/* Live preview of the stroke being drawn (container-space, transient). */}
      {draw.livePoints && draw.livePoints.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <path
            d={pointsToPathData(
              draw.livePoints.map((p) => ({ x: p.x, y: p.y })),
              { blockId: '', contentHash: '', left: 0, top: 0, width: 1, height: 1 },
            )}
            fill="none"
            stroke={toolSettings.color}
            strokeWidth={tool === 'highlighter' ? toolSettings.width * 3 : toolSettings.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1}
            style={tool === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
          />
        </svg>
      )}

      {/* Ephemeral laser dot (never persisted). */}
      {draw.laser && (
        <span
          className="pointer-events-none absolute rounded-full"
          style={{
            left: draw.laser.x - 6,
            top: draw.laser.y - 6,
            width: 12,
            height: 12,
            background: 'radial-gradient(circle, rgba(239,68,68,0.95) 0%, rgba(239,68,68,0) 70%)',
            boxShadow: '0 0 8px 2px rgba(239,68,68,0.6)',
          }}
        />
      )}

      {/* Stale (drift) badges — one per drifted group, near its block. */}
      {rects.map((rect) => {
        const staleGroups = new Set(
          strokes.filter((s) => s.blockId === rect.blockId && s.stale).map((s) => s.groupId),
        );
        texts
          .filter((tx) => tx.blockId === rect.blockId && tx.stale)
          .forEach((tx) => staleGroups.add(tx.groupId));
        if (staleGroups.size === 0) return null;
        return (
          <div
            key={`stale-${rect.blockId}`}
            className="pointer-events-auto absolute flex flex-col items-end gap-1"
            style={{ left: rect.left + rect.width - 132, top: rect.top + 4, width: 128 }}
          >
            {[...staleGroups].map((gid) => (
              <div
                key={gid}
                className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900 shadow-sm ring-1 ring-amber-300"
              >
                <span>내용 변경됨</span>
                {onDiscard && (
                  <button
                    type="button"
                    onClick={() => onDiscard(gid)}
                    className="rounded px-1 font-medium underline hover:text-amber-950"
                  >
                    지우기
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {/* Full-stage capture layer: only interactive while a tool is active. */}
      <div
        className="absolute inset-0"
        style={{ pointerEvents: draw.active ? 'auto' : 'none', cursor, touchAction: 'none' }}
        {...draw.captureProps}
      />

      {/* Inline text input at the tapped position. */}
      {textPlacement && (
        <input
          ref={textInputRef}
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText();
            if (e.key === 'Escape') {
              setTextPlacement(null);
              setTextValue('');
            }
          }}
          aria-label="주석 텍스트 입력"
          className="pointer-events-auto absolute rounded border border-accent bg-paper px-1 py-0.5 font-sans text-sm text-ink shadow"
          style={{
            left: textPlacement.pagePosition.x,
            top: textPlacement.pagePosition.y,
            minWidth: 120,
          }}
        />
      )}
    </div>
  );
}
