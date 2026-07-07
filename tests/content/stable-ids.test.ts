import { describe, expect, it } from 'vitest';

import { ensureStableIds } from '@/lib/content';

const FIXTURE = `# Merge sort

:::{lecture-summary}
Merge sort is a divide-and-conquer algorithm.
:::

:::{student-detail}
Split the array in half recursively, then merge sorted halves back together.
:::

:::{instructor-note}
Ask the class why the worst case is still O(n log n).
:::

## Complexity

The recurrence solves to $O(n \\log n)$ in every case.

:::{equation}
$$ T(n) = 2T(n/2) + O(n) $$
:::
`;

describe('ensureStableIds', () => {
  it('mints a blk_-prefixed id for every top-level block and writes markers back into the source', () => {
    const { source, blocks } = ensureStableIds(FIXTURE);

    // heading, lecture-summary, student-detail, instructor-note, heading, paragraph, equation
    expect(blocks).toHaveLength(7);
    expect(blocks.map((b) => b.blockType)).toEqual([
      'heading',
      'lecture-summary',
      'student-detail',
      'instructor-note',
      'heading',
      'paragraph',
      'equation',
    ]);
    for (const block of blocks) {
      expect(block.id).toMatch(/^blk_[A-Za-z0-9_-]+$/);
    }
    // one marker comment per block, written back into the returned source
    const markerCount = (source.match(/<!-- blk:blk_[A-Za-z0-9_-]+ -->/g) ?? []).length;
    expect(markerCount).toBe(blocks.length);
  });

  it('is idempotent: running it twice produces the same source and the same ids/hashes', () => {
    const first = ensureStableIds(FIXTURE);
    const second = ensureStableIds(first.source);

    expect(second.source).toBe(first.source);
    expect(second.blocks.map((b) => b.id)).toEqual(first.blocks.map((b) => b.id));
    expect(second.blocks.map((b) => b.contentHash)).toEqual(first.blocks.map((b) => b.contentHash));
  });

  it('preserves ids (and swaps order) when two whole blocks are reordered in the source', () => {
    const first = ensureStableIds('First paragraph.\n\nSecond paragraph.\n');
    expect(first.blocks).toHaveLength(2);
    const [firstId, secondId] = first.blocks.map((b) => b.id);

    // Swap the two marker+paragraph chunks as a unit, the way a real editor
    // move/reorder operation would.
    const [chunkA, chunkB] = first.source.split('\n\n').filter((chunk) => chunk.length > 0);
    const reordered = `${chunkB}\n\n${chunkA}\n`;

    const second = ensureStableIds(reordered);
    expect(second.blocks).toHaveLength(2);
    expect(second.blocks.map((b) => b.id)).toEqual([secondId, firstId]);
    expect(second.blocks[0]?.order).toBe(0);
    expect(second.blocks[1]?.order).toBe(1);
  });

  it('keeps a block id stable when its text is edited, and changes only the contentHash', () => {
    const first = ensureStableIds(FIXTURE);
    const summaryBefore = first.blocks.find((b) => b.blockType === 'lecture-summary');
    expect(summaryBefore).toBeDefined();

    const edited = first.source.replace(
      'Merge sort is a divide-and-conquer algorithm.',
      'Merge sort is a stable, divide-and-conquer sorting algorithm that always runs in O(n log n).',
    );
    const second = ensureStableIds(edited);
    const summaryAfter = second.blocks.find((b) => b.blockType === 'lecture-summary');

    expect(summaryAfter?.id).toBe(summaryBefore?.id);
    expect(summaryAfter?.contentHash).not.toBe(summaryBefore?.contentHash);

    // every other block's id and hash is untouched by the unrelated edit
    const otherBefore = first.blocks.filter((b) => b.blockType !== 'lecture-summary');
    const otherAfter = second.blocks.filter((b) => b.blockType !== 'lecture-summary');
    expect(otherAfter.map((b) => b.id)).toEqual(otherBefore.map((b) => b.id));
    expect(otherAfter.map((b) => b.contentHash)).toEqual(otherBefore.map((b) => b.contentHash));
  });

  it('reuses an existing marker id instead of minting a new one', () => {
    const first = ensureStableIds('Only paragraph.\n');
    const untouched = ensureStableIds(first.source);
    expect(untouched.blocks[0]?.id).toBe(first.blocks[0]?.id);
    // no new markers were appended
    expect(untouched.source).toBe(first.source);
  });

  it('mints a fresh id instead of colliding when a marker was copy-pasted onto two blocks', () => {
    const duplicated = '<!-- blk:blk_dupe -->\nFirst.\n\n<!-- blk:blk_dupe -->\nSecond.\n';
    const { blocks } = ensureStableIds(duplicated);

    expect(blocks).toHaveLength(2);
    // ids must be unique — the second occurrence cannot silently keep the
    // first block's id (that would make the DB upsert conflate them).
    expect(blocks[0]?.id).not.toBe(blocks[1]?.id);
    expect(blocks[0]?.id).toBe('blk_dupe');
  });

  it('classifies instructor-note as visibility "instructor" and everything else as "public"', () => {
    const { blocks } = ensureStableIds(FIXTURE);
    const byType = new Map(blocks.map((b) => [b.blockType, b]));

    expect(byType.get('instructor-note')?.visibility).toBe('instructor');
    expect(byType.get('lecture-summary')?.visibility).toBe('public');
    expect(byType.get('student-detail')?.visibility).toBe('public');
    expect(byType.get('heading')?.visibility).toBe('public');
    expect(byType.get('equation')?.visibility).toBe('public');

    // and no other block accidentally ends up instructor-only
    const instructorBlocks = blocks.filter((b) => b.visibility === 'instructor');
    expect(instructorBlocks).toHaveLength(1);
    expect(instructorBlocks[0]?.blockType).toBe('instructor-note');
  });

  it('also accepts the PRD/seed bare colon-fence form (no curly braces) for the same directives', () => {
    const bare = `:::instructor-note
secret for instructors only
:::
`;
    const { blocks } = ensureStableIds(bare);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.blockType).toBe('instructor-note');
    expect(blocks[0]?.visibility).toBe('instructor');
  });
});
