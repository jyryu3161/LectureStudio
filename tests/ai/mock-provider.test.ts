import { describe, expect, it } from 'vitest';

import { mockProvider } from '@/lib/ai/providers/mock';
import type { AnnotationContext } from '@/lib/ai/types';
import { ARTIFACT_KINDS, type ArtifactKind, type GenerateRequest } from '@/lib/ai/types';

function requestFor(
  kind: ArtifactKind,
  instruction: string,
  annotations?: AnnotationContext,
): GenerateRequest {
  return {
    kind,
    instruction,
    context: {
      courseTitle: 'CS-201',
      chapterTitle: 'Merge Sort',
      chapterSource: '# Merge Sort\n\nSome content.',
      annotations,
    },
  };
}

const ANNOTATION_CONTEXT: AnnotationContext = {
  sessionCount: 1,
  totalAnnotations: 4,
  blocks: [
    { blockId: 'blk_hot', count: 4, byType: { pen: 4 }, sourceText: 'Confusing recurrence.' },
  ],
};

describe('mockProvider', () => {
  const cfg = { apiKey: null, model: 'mock-1' };

  it('is the mock provider with a single deterministic model', () => {
    expect(mockProvider.id).toBe('mock');
    expect(mockProvider.defaultModel).toBe('mock-1');
    expect(mockProvider.models).toContain('mock-1');
  });

  it('is deterministic: same request yields identical output', async () => {
    const req = requestFor('outline', 'summarize the sections');
    const a = await mockProvider.generate(req, cfg);
    const b = await mockProvider.generate(req, cfg);
    expect(a).toBe(b);
  });

  it('embeds the kind, chapter title, and instruction verbatim (for every kind)', async () => {
    for (const kind of ARTIFACT_KINDS) {
      const instruction = `do-${kind}-please`;
      const out = await mockProvider.generate(requestFor(kind, instruction), cfg);
      expect(out.length).toBeGreaterThan(0);
      expect(out).toContain(kind); // the kind appears in the output
      expect(out).toContain('Merge Sort'); // the chapter title
      expect(out).toContain(instruction); // the instruction verbatim
    }
  });

  it('produces a python matplotlib code block for figure-code', async () => {
    const out = await mockProvider.generate(requestFor('figure-code', 'plot it'), cfg);
    expect(out).toContain('```python');
    expect(out).toContain('matplotlib');
  });

  it('produces a quiz section for quiz', async () => {
    const out = await mockProvider.generate(requestFor('quiz', 'ask questions'), cfg);
    expect(out).toContain('## Quiz');
    expect(out).toContain('정답');
  });

  it('handles an empty instruction without throwing', async () => {
    const out = await mockProvider.generate(requestFor('student-explanation', ''), cfg);
    expect(out.length).toBeGreaterThan(0);
  });

  // --- MVP4 kinds -------------------------------------------------------
  it('produces a matplotlib FuncAnimation code block with a deterministic seed for animation-code', async () => {
    const out = await mockProvider.generate(requestFor('animation-code', 'animate it'), cfg);
    expect(out).toContain('```python');
    expect(out).toContain('FuncAnimation');
    expect(out).toContain('np.random.seed(0)');
  });

  it('produces a rewrite section for difficulty-adjust echoing the target instruction', async () => {
    const out = await mockProvider.generate(requestFor('difficulty-adjust', '더 쉽게'), cfg);
    expect(out).toContain('## Difficulty Adjust');
    expect(out).toContain('더 쉽게');
  });

  it('echoes the per-block annotation stats table for revision-from-annotations', async () => {
    const out = await mockProvider.generate(
      requestFor('revision-from-annotations', 'improve it', ANNOTATION_CONTEXT),
      cfg,
    );
    expect(out).toContain('## Revision Suggestions');
    // The assembled context flowed through to the output (e2e can assert on this).
    expect(out).toContain('| block_id | count | types |');
    expect(out).toContain('| blk_hot | 4 | pen:4 |');
    expect(out).toContain('Total annotations: 4');
    expect(out).toContain('### 근거');
  });

  it('revision-from-annotations without context still yields deterministic non-empty output', async () => {
    const out = await mockProvider.generate(requestFor('revision-from-annotations', 'improve it'), cfg);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('revision-from-annotations');
  });
});
