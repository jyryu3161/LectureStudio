import { describe, expect, it } from 'vitest';

import { blockTypeOf, visibilityForBlockType } from '@/lib/content';

describe('blockTypeOf', () => {
  it('maps standard mdast node types to their PRD block types', () => {
    expect(blockTypeOf({ type: 'heading' })).toBe('heading');
    expect(blockTypeOf({ type: 'paragraph' })).toBe('paragraph');
    expect(blockTypeOf({ type: 'code' })).toBe('code');
    expect(blockTypeOf({ type: 'math' })).toBe('equation');
    expect(blockTypeOf({ type: 'image' })).toBe('figure');
  });

  it('maps the custom directive node types to their PRD block types', () => {
    expect(blockTypeOf({ type: 'lectureSummary' })).toBe('lecture-summary');
    expect(blockTypeOf({ type: 'studentDetail' })).toBe('student-detail');
    expect(blockTypeOf({ type: 'instructorNote' })).toBe('instructor-note');
    expect(blockTypeOf({ type: 'equation' })).toBe('equation');
  });

  it('maps figure/code containers by kind', () => {
    expect(blockTypeOf({ type: 'container', kind: 'figure' })).toBe('figure');
    expect(blockTypeOf({ type: 'container', kind: 'code' })).toBe('code');
    expect(blockTypeOf({ type: 'container', kind: 'other' })).toBe('paragraph');
  });

  it('falls back to paragraph for anything unrecognized, rather than throwing or dropping the block', () => {
    expect(blockTypeOf({ type: 'mystDirective', name: 'some-unknown-thing' })).toBe('paragraph');
    expect(blockTypeOf({ type: 'somethingNobodyRegistered' })).toBe('paragraph');
  });
});

describe('visibilityForBlockType', () => {
  it('is instructor-only for instructor-note and public for every other type', () => {
    expect(visibilityForBlockType('instructor-note')).toBe('instructor');

    const publicTypes = [
      'heading',
      'paragraph',
      'lecture-summary',
      'student-detail',
      'equation',
      'figure',
      'code',
      'code-output',
      'video',
      'animation',
      'interactive-demo',
      'quiz',
    ] as const;
    for (const blockType of publicTypes) {
      expect(visibilityForBlockType(blockType)).toBe('public');
    }
  });
});
