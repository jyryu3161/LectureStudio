import { describe, expect, it } from 'vitest';

import {
  assignBlock,
  denormalizePoint,
  hitTestStrokes,
  normalizePoint,
  segmentStroke,
  type BlockRect,
  type ContainerPoint,
  type HitTestStroke,
} from '@/components/annotation/geometry';

// Two stacked blocks in container space. Block A on top, Block B below, with a
// 100px-wide gutter to the right of both (x >= 200).
const BLOCK_A: BlockRect = {
  blockId: 'blk_a',
  contentHash: 'hash_a',
  left: 0,
  top: 0,
  width: 200,
  height: 100,
};
const BLOCK_B: BlockRect = {
  blockId: 'blk_b',
  contentHash: 'hash_b',
  left: 0,
  top: 100,
  width: 200,
  height: 100,
};
const RECTS = [BLOCK_A, BLOCK_B];

describe('segmentStroke', () => {
  it('splits a stroke spanning two blocks into two segments (one per block), sharing the caller group', () => {
    // A vertical stroke from inside A (y=50) down into B (y=150).
    const stroke: ContainerPoint[] = [
      { x: 100, y: 25 },
      { x: 100, y: 50 },
      { x: 100, y: 90 }, // still A
      { x: 100, y: 150 }, // now B
      { x: 100, y: 175 }, // still B
    ];

    const segments = segmentStroke(stroke, RECTS);
    expect(segments).toHaveLength(2);

    const [first, second] = segments;
    expect(first.blockId).toBe('blk_a');
    expect(first.contentHash).toBe('hash_a');
    expect(second.blockId).toBe('blk_b');
    expect(second.contentHash).toBe('hash_b');

    // Segment A: 3 points, all normalized against A's 200x100 box.
    expect(first.points).toHaveLength(3);
    expect(first.points[0]).toEqual({ x: 0.5, y: 0.25 });
    expect(first.points[2]).toEqual({ x: 0.5, y: 0.9 });

    // Segment B: 2 points, normalized against B (top=100 subtracted).
    expect(second.points).toHaveLength(2);
    expect(second.points[0]).toEqual({ x: 0.5, y: 0.5 }); // (150-100)/100
    expect(second.points[1]).toEqual({ x: 0.5, y: 0.75 });
  });

  it('attaches gutter/margin points to the nearest block', () => {
    // Point to the right of A (in the gutter) -> nearest block is A.
    const gutterNearA: ContainerPoint = { x: 260, y: 40 };
    expect(assignBlock(gutterNearA, RECTS)?.blockId).toBe('blk_a');

    // Point far below B -> nearest block is B.
    const belowB: ContainerPoint = { x: 100, y: 400 };
    expect(assignBlock(belowB, RECTS)?.blockId).toBe('blk_b');

    // A stroke entirely in A's right gutter produces a single A segment,
    // with x clamped to the [0,1] edge.
    const gutterStroke: ContainerPoint[] = [
      { x: 260, y: 20 },
      { x: 280, y: 60 },
    ];
    const segments = segmentStroke(gutterStroke, RECTS);
    expect(segments).toHaveLength(1);
    expect(segments[0].blockId).toBe('blk_a');
    expect(segments[0].points.every((p) => p.x === 1)).toBe(true);
  });

  it('returns no segments when there are no blocks', () => {
    expect(segmentStroke([{ x: 10, y: 10 }], [])).toEqual([]);
  });
});

describe('normalization round-trips across a resize', () => {
  it('re-scales normalized coords when the block box scales x2', () => {
    const original: ContainerPoint = { x: 50, y: 40 };
    const normalized = normalizePoint(original, BLOCK_A);
    expect(normalized).toEqual({ x: 0.25, y: 0.4 });

    // Same box: denormalize returns the original px (round-trip).
    expect(denormalizePoint(normalized, BLOCK_A)).toEqual(original);

    // Resize block to 2x (400x200 at same origin): px coords scale x2.
    const scaled: BlockRect = { ...BLOCK_A, width: 400, height: 200 };
    const rescaled = denormalizePoint(normalized, scaled);
    expect(rescaled).toEqual({ x: 100, y: 80 });
    expect(rescaled.x).toBe(original.x * 2);
    expect(rescaled.y).toBe(original.y * 2);
  });
});

describe('hitTestStrokes (eraser)', () => {
  const rectsById = new Map<string, BlockRect>([
    ['blk_a', BLOCK_A],
    ['blk_b', BLOCK_B],
  ]);

  // A horizontal stroke across the middle of block A at y=50 (normalized 0.5).
  const strokes: HitTestStroke[] = [
    {
      groupId: 'grp_1',
      blockId: 'blk_a',
      points: [
        { x: 0.25, y: 0.5 },
        { x: 0.75, y: 0.5 },
      ],
    },
  ];

  it('returns the group id when the pointer is within threshold of a stroke', () => {
    // Pointer at (100,55): 5px from the stroke line -> within a 12px threshold.
    expect(hitTestStrokes({ x: 100, y: 55 }, strokes, rectsById, 12)).toBe('grp_1');
  });

  it('returns null when the pointer is far from every stroke', () => {
    expect(hitTestStrokes({ x: 100, y: 90 }, strokes, rectsById, 12)).toBeNull();
  });
});
