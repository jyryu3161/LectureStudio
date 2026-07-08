/**
 * Mock provider — the default active provider. NO network, NO API key.
 *
 * Produces deterministic, templated MyST output per kind that embeds the
 * artifact kind, chapter title, and the author's instruction verbatim, so
 * e2e/unit tests can assert on the result without any external service.
 */
import { formatAnnotationStats } from '../prompts';
import type { AiProvider, GenerateRequest, ProviderConfig } from '../types';

const MOCK_MODEL = 'mock-1';

/** Per-kind deterministic MyST body. Keep each self-evidently MyST. */
function bodyFor(req: GenerateRequest, instruction: string): string {
  const { kind } = req;
  const chapterTitle = req.context.chapterTitle;
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
    case 'animation-code':
      return [
        note,
        '',
        '```python',
        'import numpy as np',
        'import matplotlib.pyplot as plt',
        'from matplotlib.animation import FuncAnimation',
        '',
        `# ${echo}`,
        'np.random.seed(0)  # deterministic',
        'fig, ax = plt.subplots()',
        'x = np.linspace(0, 2 * np.pi, 100)',
        '(line,) = ax.plot(x, np.sin(x))',
        `ax.set_title(${JSON.stringify(chapterTitle)})`,
        '',
        'def update(frame):',
        '    line.set_ydata(np.sin(x + frame / 10))',
        '    return (line,)',
        '',
        'ani = FuncAnimation(fig, update, frames=60, interval=50, blit=True)',
        '```',
        '',
        'Run interactively or export with `ani.save("anim.gif")`.',
      ].join('\n');
    case 'difficulty-adjust':
      return [
        note,
        '',
        '## Difficulty Adjust',
        '',
        echo,
        '',
        'This is a deterministic mock rewrite at the requested difficulty level.',
      ].join('\n');
    case 'revision-from-annotations': {
      const annotations = req.context.annotations;
      const stats = annotations
        ? formatAnnotationStats(annotations)
        : '(no annotation context provided)';
      return [
        note,
        '',
        '## Revision Suggestions',
        '',
        echo,
        '',
        stats,
        '',
        '### 근거',
        '',
        '- Deterministic mock revision grounded in the annotation stats above.',
      ].join('\n');
    }
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
    return bodyFor(req, instruction);
  },
};
