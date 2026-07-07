/**
 * Pure annotation geometry: stroke segmentation, coordinate normalization and
 * eraser hit-testing.
 *
 * This module is deliberately DOM-free and contract-free. It works entirely on
 * plain numbers so it can be unit-tested under jsdom without a real layout
 * engine (getBoundingClientRect returns zeros in jsdom) and so the tests do not
 * depend on `@/lib/annotations/types` existing yet. The React layer converts
 * live DOM measurements into these plain shapes and converts the results back
 * into the SHARED ANNOTATION CONTRACT types.
 *
 * Coordinate spaces used here:
 *   - "container" coords: pixels relative to the top-left of the scroll
 *     container that holds the rendered `[data-block-id]` sections.
 *   - "block-normalized" coords: 0..1 relative to a single block's bounding
 *     box, exactly as persisted per PRD §8.6/§8.7 (`coord_space:'block_normalized'`).
 */

/** A point in "container" pixel space (relative to the annotated container). */
export interface ContainerPoint {
  x: number;
  y: number;
}

/** A point in block-normalized 0..1 space. */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/**
 * A single block's box measured in container pixel space. `contentHash` is
 * carried through so an emitted segment can record the hash it was drawn
 * against (`created_against_hash`) for later drift detection.
 */
export interface BlockRect {
  blockId: string;
  contentHash: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * One per-block piece of a stroke: the block it belongs to and that stroke
 * piece's points expressed in that block's normalized 0..1 space.
 */
export interface StrokeSegment {
  blockId: string;
  contentHash: string;
  points: NormalizedPoint[];
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** True if `p` lies inside (or on the edge of) `rect`. */
export function pointInRect(p: ContainerPoint, rect: BlockRect): boolean {
  return (
    p.x >= rect.left &&
    p.x <= rect.left + rect.width &&
    p.y >= rect.top &&
    p.y <= rect.top + rect.height
  );
}

/** Shortest distance from `p` to `rect` (0 when inside). */
export function distanceToRect(p: ContainerPoint, rect: BlockRect): number {
  const dx = Math.max(rect.left - p.x, 0, p.x - (rect.left + rect.width));
  const dy = Math.max(rect.top - p.y, 0, p.y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
}

/**
 * The block a point belongs to: the block that contains it, or — for points in
 * the gutter/margins that are inside no block — the nearest block by edge
 * distance (PRD §8.7: "Strokes in margins/gutter attach to the nearest block").
 * Returns `null` only when there are no blocks at all.
 */
export function assignBlock(p: ContainerPoint, rects: BlockRect[]): BlockRect | null {
  if (rects.length === 0) return null;
  let nearest: BlockRect | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const rect of rects) {
    if (pointInRect(p, rect)) return rect;
    const distance = distanceToRect(p, rect);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = rect;
    }
  }
  return nearest;
}

/** Container px -> block-normalized 0..1 (clamped so gutter points sit on the edge). */
export function normalizePoint(p: ContainerPoint, rect: BlockRect): NormalizedPoint {
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: clamp01((p.x - rect.left) / width),
    y: clamp01((p.y - rect.top) / height),
  };
}

/** Block-normalized 0..1 -> container px, using the block's *current* box. */
export function denormalizePoint(n: NormalizedPoint, rect: BlockRect): ContainerPoint {
  return {
    x: rect.left + n.x * rect.width,
    y: rect.top + n.y * rect.height,
  };
}

/**
 * Split a raw stroke (points in container px) into per-block segments.
 *
 * Each point is assigned to a block (containing block, else nearest). The
 * stroke is then walked and broken wherever the assigned block changes, so a
 * stroke crossing block A then block B yields two segments — one per block —
 * whose points are normalized against their own block. Callers share one
 * `group_id` across the returned segments so the eraser can remove the whole
 * original stroke.
 */
export function segmentStroke(points: ContainerPoint[], rects: BlockRect[]): StrokeSegment[] {
  if (points.length === 0 || rects.length === 0) return [];

  const segments: StrokeSegment[] = [];
  let current: StrokeSegment | null = null;

  for (const point of points) {
    const block = assignBlock(point, rects);
    if (!block) continue;
    if (!current || current.blockId !== block.blockId) {
      current = { blockId: block.blockId, contentHash: block.contentHash, points: [] };
      segments.push(current);
    }
    current.points.push(normalizePoint(point, block));
  }

  return segments;
}

/** Shortest distance from point `p` to the line segment `a`->`b` (all container px). */
export function distanceToLineSegment(
  p: ContainerPoint,
  a: ContainerPoint,
  b: ContainerPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** A rendered stroke considered for eraser hit-testing. */
export interface HitTestStroke {
  groupId: string;
  blockId: string;
  points: NormalizedPoint[];
}

/**
 * Eraser hit-test: given a pointer in container px and the strokes currently
 * rendered, return the `groupId` of the closest stroke whose polyline passes
 * within `thresholdPx` of the pointer, or `null` if none. Strokes are
 * denormalized against their block's *current* box so hit-testing works after
 * a resize. The caller deletes the whole group (all segments of that stroke).
 */
export function hitTestStrokes(
  pointer: ContainerPoint,
  strokes: HitTestStroke[],
  rectsById: Map<string, BlockRect>,
  thresholdPx: number,
): string | null {
  let bestGroup: string | null = null;
  let bestDistance = thresholdPx;

  for (const stroke of strokes) {
    const rect = rectsById.get(stroke.blockId);
    if (!rect || stroke.points.length === 0) continue;
    const pts = stroke.points.map((n) => denormalizePoint(n, rect));

    let distance = Number.POSITIVE_INFINITY;
    if (pts.length === 1) {
      distance = Math.hypot(pointer.x - pts[0].x, pointer.y - pts[0].y);
    } else {
      for (let i = 0; i < pts.length - 1; i += 1) {
        distance = Math.min(distance, distanceToLineSegment(pointer, pts[i], pts[i + 1]));
      }
    }

    if (distance <= bestDistance) {
      bestDistance = distance;
      bestGroup = stroke.groupId;
    }
  }

  return bestGroup;
}

/** Build an SVG polyline/path `d` from normalized points scaled to a block box. */
export function pointsToPathData(points: NormalizedPoint[], rect: BlockRect): string {
  if (points.length === 0) return '';
  const pts = points.map((n) => denormalizePoint(n, rect));
  if (pts.length === 1) {
    // A single-point stroke: draw a tiny dot so it is still visible.
    const { x, y } = pts[0];
    return `M ${x} ${y} L ${x + 0.01} ${y}`;
  }
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}
