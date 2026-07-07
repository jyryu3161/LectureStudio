import { describe, expect, it } from 'vitest';

import { mockProvider } from '@/lib/ai/providers/mock';
import { ARTIFACT_KINDS, type ArtifactKind, type GenerateRequest } from '@/lib/ai/types';

function requestFor(kind: ArtifactKind, instruction: string): GenerateRequest {
  return {
    kind,
    instruction,
    context: {
      courseTitle: 'CS-201',
      chapterTitle: 'Merge Sort',
      chapterSource: '# Merge Sort\n\nSome content.',
    },
  };
}

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
});
