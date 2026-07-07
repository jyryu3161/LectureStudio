/**
 * UI/interaction types for the client annotation engine.
 *
 * Data-contract types (`AnnotationRow`, `NewAnnotation`, `AnnotationType`,
 * `AnnotationColor`, `Point`, `StrokeData`, `TextData`, `AnnotationStyle`) come
 * from the single source of truth at `@/lib/annotations/types` (SHARED
 * ANNOTATION CONTRACT, PRD §8.6/§8.7) and are re-exported here for convenience
 * — they are never redeclared. Everything defined *in* this file is
 * engine-local presentation state (which tool is active, styling, the
 * props/callbacks surface).
 */
import type {
  AnnotationColor,
  AnnotationData,
  AnnotationRow,
  AnnotationStyle,
  AnnotationType,
  NewAnnotation,
  Point,
  StrokeData,
  TextData,
} from '@/lib/annotations/types';

export type {
  AnnotationColor,
  AnnotationData,
  AnnotationRow,
  AnnotationStyle,
  AnnotationType,
  NewAnnotation,
  Point,
  StrokeData,
  TextData,
};

/**
 * The active drawing tool. `null` means "not annotating" — the capture layer is
 * inert and `pointer-events` pass through to the page underneath.
 *
 * `'pen'`, `'highlighter'` and `'text'` persist; `'eraser'` deletes; `'laser'`
 * is a purely ephemeral local pointer that is never persisted (PRD §8.7).
 */
export type AnnotationTool = 'pen' | 'highlighter' | 'eraser' | 'laser' | 'text' | null;

/** Current pen/highlighter/text styling, driven by the (separately-owned) toolbar. */
export interface ToolSettings {
  /** One of the contract palette colors: '#16181c' | '#e11d2e' | '#2563eb'. */
  color: AnnotationColor;
  /** Base stroke width in px (highlighter is rendered thicker + translucent). */
  width: number;
}

/** Highlighter translucency (PRD annotation contract: opacity ~0.35, thicker). */
export const HIGHLIGHTER_OPACITY = 0.35;
export const HIGHLIGHTER_WIDTH_MULTIPLIER = 3;

/** Default eraser hit radius in px. */
export const ERASER_HIT_RADIUS_PX = 12;
