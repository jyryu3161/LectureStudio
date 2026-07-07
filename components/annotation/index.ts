/**
 * Client annotation engine (custom SVG, zero deps).
 *
 * Public surface for the page/toolbar to wire up. Data-contract types come from
 * `@/lib/annotations/types` (SHARED ANNOTATION CONTRACT) — import those from
 * there, not from here.
 */
export { AnnotationLayer, type AnnotationLayerProps } from './annotation-layer';
export {
  useAnnotationDraw,
  type UseAnnotationDrawOptions,
  type UseAnnotationDrawResult,
  type TextPlacement,
} from './use-annotation-draw';
export { useBlockRects } from './use-block-rects';
export {
  AnnotationSyncQueue,
  useAnnotationSync,
  type AnnotationSyncOptions,
  type SyncBatch,
  type SyncOp,
  type SyncQueueState,
  type SyncStatus,
} from './sync';
export {
  type AnnotationTool,
  type ToolSettings,
  HIGHLIGHTER_OPACITY,
  HIGHLIGHTER_WIDTH_MULTIPLIER,
  ERASER_HIT_RADIUS_PX,
} from './types';
export {
  segmentStroke,
  hitTestStrokes,
  normalizePoint,
  denormalizePoint,
  assignBlock,
  pointInRect,
  distanceToRect,
  pointsToPathData,
  type BlockRect,
  type ContainerPoint,
  type NormalizedPoint,
  type StrokeSegment,
  type HitTestStroke,
} from './geometry';
