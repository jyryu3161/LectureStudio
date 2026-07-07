import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Block } from '@/lib/content';
import { renderBlocks } from '@/lib/render';
import type { CourseRole } from '@/lib/supabase/roles';

/**
 * PRD §5.6 / §15.3 acceptance criteria: no student-facing render may
 * contain instructor-note content, in the React tree OR any serialized
 * HTML -- CSS-only hiding is explicitly forbidden. This exercises both:
 * the returned element array (nothing constructed for a filtered block) and
 * a fully rendered HTML string (nothing leaks via a nested/serialized
 * payload either).
 */

function makeBlock(fields: Pick<Block, 'id' | 'blockType' | 'visibility' | 'node'>): Block {
  return {
    order: 0,
    contentHash: `hash-${fields.id}`,
    sourceRange: null,
    metadata: {},
    ...fields,
  };
}

const PUBLIC_TEXT = 'Public paragraph text visible to everyone';
const INSTRUCTOR_TEXT = 'Confidential instructor-only teaching note';

const publicBlock = makeBlock({
  id: 'blk_public1',
  blockType: 'paragraph',
  visibility: 'public',
  node: { type: 'paragraph', children: [{ type: 'text', value: PUBLIC_TEXT }] },
});

const instructorBlock = makeBlock({
  id: 'blk_instructor1',
  blockType: 'instructor-note',
  visibility: 'instructor',
  node: {
    type: 'instructorNote',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: INSTRUCTOR_TEXT }] }],
  },
});

const blocks: Block[] = [publicBlock, instructorBlock];

async function render(role: CourseRole | null) {
  const elements = await renderBlocks(blocks, { role });
  const html = renderToStaticMarkup(createElement(Fragment, null, elements));
  return { elements, html };
}

describe('renderBlocks instructor-note visibility', () => {
  it('excludes instructor-note from the element tree and the rendered HTML for a student', async () => {
    const { elements, html } = await render('student');

    expect(elements).toHaveLength(1);
    expect(elements[0].key).toBe('blk_public1');

    expect(html).toContain(PUBLIC_TEXT);
    expect(html).not.toContain(INSTRUCTOR_TEXT);
    expect(html).not.toContain('blk_instructor1');
  });

  it('excludes instructor-note for a signed-out guest (null role)', async () => {
    const { elements, html } = await render(null);

    expect(elements).toHaveLength(1);
    expect(html).not.toContain(INSTRUCTOR_TEXT);
  });

  it.each(['author', 'instructor', 'admin'] satisfies CourseRole[])(
    'includes instructor-note for a privileged "%s" role',
    async (role) => {
      const { elements, html } = await render(role);

      expect(elements).toHaveLength(2);
      expect(elements.map((el) => el.key)).toEqual(['blk_public1', 'blk_instructor1']);
      expect(html).toContain(PUBLIC_TEXT);
      expect(html).toContain(INSTRUCTOR_TEXT);
    },
  );
});
