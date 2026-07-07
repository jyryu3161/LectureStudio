import { describe, expect, it } from 'vitest';

import { parseWithWarnings } from '@/lib/content';

describe('parseWithWarnings', () => {
  it('recognizes the custom directives as typed nodes instead of unknown-directive errors', () => {
    const source = `:::{lecture-summary}
Summary text.
:::

:::{student-detail}
Detail text.
:::

:::{instructor-note}
Note text.
:::
`;
    const { tree, warnings } = parseWithWarnings(source);

    expect(tree.children.map((n) => n.type)).toEqual([
      'lectureSummary',
      'studentDetail',
      'instructorNote',
    ]);
    // no "unknown directive" (or any other) errors for content we own
    expect(warnings.filter((w) => w.fatal)).toEqual([]);
  });

  it('surfaces a warning for an unrecognized directive instead of throwing', () => {
    const source = `:::{totally-made-up-directive}
content
:::
`;
    expect(() => parseWithWarnings(source)).not.toThrow();
    const { warnings } = parseWithWarnings(source);
    expect(warnings.some((w) => w.fatal && /unknown directive/i.test(w.message))).toBe(true);
  });

  it('flags a figure with no alt text as a validation warning', () => {
    const source = `:::{figure} https://example.com/diagram.png
A diagram with no alt text.
:::
`;
    const { warnings } = parseWithWarnings(source);
    expect(warnings.some((w) => w.ruleId === 'figure-alt-required')).toBe(true);
  });

  it('does not warn when a figure has alt text', () => {
    const source = `:::{figure} https://example.com/diagram.png
:alt: A diagram showing the merge step of merge sort
A diagram with alt text.
:::
`;
    const { warnings } = parseWithWarnings(source);
    expect(warnings.some((w) => w.ruleId === 'figure-alt-required')).toBe(false);
  });

  it('flags a bare standalone image with no alt text too, not just the figure directive', () => {
    const source = `![](https://example.com/no-alt.png)\n`;
    const { warnings } = parseWithWarnings(source);
    expect(warnings.some((w) => w.ruleId === 'figure-alt-required')).toBe(true);
  });

  it('maps a bare $$ ... $$ block and code fences to their block types without any directive', () => {
    const source = `$$\nE = mc^2\n$$\n\n\`\`\`python\nprint("hi")\n\`\`\`\n`;
    const { tree } = parseWithWarnings(source);
    expect(tree.children.map((n) => n.type)).toEqual(['math', 'code']);
  });
});
