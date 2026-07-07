/**
 * Mock provider — the default active provider. NO network, NO API key.
 *
 * Produces deterministic, templated MyST output per kind that embeds the
 * artifact kind, chapter title, and the author's instruction verbatim, so
 * e2e/unit tests can assert on the result without any external service.
 */
import type { AiProvider, ArtifactKind, GenerateRequest, ProviderConfig } from '../types';

const MOCK_MODEL = 'mock-1';

/** Per-kind deterministic MyST body. Keep each self-evidently MyST. */
function bodyFor(kind: ArtifactKind, instruction: string, chapterTitle: string): string {
  const note = `> Mock output for kind \`${kind}\` on chapter "${chapterTitle}".`;
  const echo = `Instruction: ${instruction}`;

  switch (kind) {
    case 'outline':
      return [note, '', '## Outline', '', `- ${chapterTitle}`, `  - ${echo}`].join('\n');
    case 'student-explanation':
      return [note, '', '## Explanation', '', echo, '', 'This is a deterministic mock explanation.'].join('\n');
    case 'instructor-summary':
      return [note, '', '## Instructor Summary', '', `- ${echo}`, '- Deterministic mock summary point.'].join('\n');
    case 'figure-code':
      return [
        note,
        '',
        '```python',
        'import matplotlib.pyplot as plt',
        '',
        `# ${echo}`,
        'fig, ax = plt.subplots()',
        'ax.plot([0, 1, 2], [0, 1, 4])',
        `ax.set_title(${JSON.stringify(chapterTitle)})`,
        'plt.show()',
        '```',
        '',
        'This mock figure plots a simple curve for the chapter.',
      ].join('\n');
    case 'code-explanation':
      return [note, '', '## Code Explanation', '', echo, '', '1. Deterministic mock step one.', '2. Deterministic mock step two.'].join('\n');
    case 'quiz':
      return [
        note,
        '',
        '## Quiz',
        '',
        `1. ${echo}`,
        '   - A. Option one',
        '   - B. Option two',
        '',
        '### 정답',
        '',
        '1. A',
      ].join('\n');
    default: {
      // Exhaustiveness guard — a new kind must extend this switch.
      const _never: never = kind;
      return _never;
    }
  }
}

export const mockProvider: AiProvider = {
  id: 'mock',
  label: 'Mock (offline)',
  models: [MOCK_MODEL],
  defaultModel: MOCK_MODEL,
  async generate(req: GenerateRequest, _cfg: ProviderConfig): Promise<string> {
    const instruction = req.instruction.trim() || '(none)';
    return bodyFor(req.kind, instruction, req.context.chapterTitle);
  },
};
