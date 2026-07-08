import { describe, expect, it } from 'vitest';

import { buildPrompt, formatAnnotationStats } from '@/lib/ai/prompts';
import type { AnnotationContext } from '@/lib/ai/types';
import { ARTIFACT_KINDS, type ArtifactKind, type GenerateRequest } from '@/lib/ai/types';

const ANNOTATION_CONTEXT: AnnotationContext = {
  sessionCount: 2,
  totalAnnotations: 7,
  blocks: [
    { blockId: 'blk_hot', count: 5, byType: { pen: 3, highlighter: 2 }, sourceText: 'The tricky recurrence T(n).' },
    { blockId: 'blk_warm', count: 2, byType: { text: 2 }, sourceText: 'A second confusing paragraph.' },
  ],
};

const CHAPTER_SOURCE = '# Merge Sort\n\nMerge sort splits the array and merges the halves.';

function requestFor(kind: ArtifactKind, overrides?: Partial<GenerateRequest>): GenerateRequest {
  return {
    kind,
    instruction: 'be concise',
    context: {
      courseTitle: 'CS-201',
      chapterTitle: 'Merge Sort',
      chapterSource: CHAPTER_SOURCE,
    },
    ...overrides,
  };
}

describe('buildPrompt', () => {
  it('builds a non-empty system+user prompt embedding the chapter source for every kind', () => {
    for (const kind of ARTIFACT_KINDS) {
      const { system, user } = buildPrompt(requestFor(kind));
      expect(system.trim().length).toBeGreaterThan(0);
      expect(user.trim().length).toBeGreaterThan(0);
      // Grounded in the actual chapter source.
      expect(user).toContain(CHAPTER_SOURCE);
      // Carries the author's instruction and the kind.
      expect(user).toContain('be concise');
      expect(user).toContain(kind);
      // Carries the chapter/course titles.
      expect(user).toContain('Merge Sort');
      expect(user).toContain('CS-201');
    }
  });

  it('mentions the target block id when one is provided', () => {
    const { user } = buildPrompt(
      requestFor('code-explanation', {
        context: {
          courseTitle: 'CS-201',
          chapterTitle: 'Merge Sort',
          chapterSource: CHAPTER_SOURCE,
          blockId: 'blk_abc123',
        },
      }),
    );
    expect(user).toContain('blk_abc123');
  });

  it('falls back to a sensible instruction when none is given', () => {
    const { user } = buildPrompt(requestFor('outline', { instruction: '   ' }));
    expect(user).toContain('no extra instruction');
  });

  it('truncates an oversized chapter source', () => {
    const huge = 'x'.repeat(20000);
    const { user } = buildPrompt(requestFor('outline', {
      context: { courseTitle: 'CS-201', chapterTitle: 'Big', chapterSource: huge },
    }));
    expect(user).toContain('source truncated for length');
    expect(user.length).toBeLessThan(huge.length + 2000);
  });

  // --- MVP4 kinds -------------------------------------------------------
  it('animation-code system prompt asks for a matplotlib FuncAnimation with a deterministic seed', () => {
    const { system } = buildPrompt(requestFor('animation-code'));
    expect(system).toContain('FuncAnimation');
    expect(system.toLowerCase()).toContain('seed');
  });

  it('difficulty-adjust carries the target level from the free-text instruction', () => {
    const { system, user } = buildPrompt(requestFor('difficulty-adjust', { instruction: '더 쉽게' }));
    expect(user).toContain('더 쉽게');
    // The system prompt explains how to read the target level from the instruction.
    expect(system).toContain('더 쉽게');
    expect(system).toContain('더 어렵게');
  });

  it('revision-from-annotations embeds the assembled annotation stats + block source in the user prompt', () => {
    const { user } = buildPrompt(
      requestFor('revision-from-annotations', {
        context: {
          courseTitle: 'CS-201',
          chapterTitle: 'Merge Sort',
          chapterSource: CHAPTER_SOURCE,
          annotations: ANNOTATION_CONTEXT,
        },
      }),
    );
    expect(user).toContain('blk_hot');
    expect(user).toContain('pen:3');
    expect(user).toContain('The tricky recurrence T(n).');
    expect(user).toContain('Total annotations: 7');
  });

  it('omits the annotation section when no annotation context is provided', () => {
    const { user } = buildPrompt(requestFor('revision-from-annotations'));
    expect(user).not.toContain('annotation statistics');
    // Still a valid, grounded prompt.
    expect(user).toContain(CHAPTER_SOURCE);
  });
});

describe('formatAnnotationStats', () => {
  it('renders a deterministic count/type table plus per-block source excerpts', () => {
    const out = formatAnnotationStats(ANNOTATION_CONTEXT);
    expect(out).toContain('| block_id | count | types |');
    expect(out).toContain('| blk_hot | 5 | pen:3, highlighter:2 |');
    expect(out).toContain('| blk_warm | 2 | text:2 |');
    expect(out).toContain('### blk_hot (5)');
    expect(out).toContain('The tricky recurrence T(n).');
    // Deterministic: same input → identical output.
    expect(formatAnnotationStats(ANNOTATION_CONTEXT)).toBe(out);
  });
});
