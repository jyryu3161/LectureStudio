import { describe, expect, it } from 'vitest';

import { buildPrompt } from '@/lib/ai/prompts';
import { ARTIFACT_KINDS, type ArtifactKind, type GenerateRequest } from '@/lib/ai/types';

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
});
