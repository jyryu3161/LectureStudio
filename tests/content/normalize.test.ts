import { describe, expect, it } from 'vitest';

import { normalizeBareDirectives } from '@/lib/content';

describe('normalizeBareDirectives', () => {
  it('wraps a bare known directive name in curly braces', () => {
    expect(normalizeBareDirectives(':::instructor-note\ntext\n:::\n')).toBe(
      ':::{instructor-note}\ntext\n:::\n',
    );
  });

  it('leaves an already-braced directive untouched', () => {
    const source = ':::{instructor-note}\ntext\n:::\n';
    expect(normalizeBareDirectives(source)).toBe(source);
  });

  it('leaves unrelated colon-fences (not one of our known directive names) untouched', () => {
    const source = ':::note\nsome admonition\n:::\n';
    expect(normalizeBareDirectives(source)).toBe(source);
  });

  it('does not rewrite the directive-like text inside a fenced code block', () => {
    const source =
      '```text\n:::instructor-note\nthis is example text, not a real directive\n:::\n```\n';
    expect(normalizeBareDirectives(source)).toBe(source);
  });

  it('normalizes multiple known bare directives in the same document', () => {
    const source = ':::lecture-summary\na\n:::\n\n:::equation\n$$ 1 + 1 $$\n:::\n';
    expect(normalizeBareDirectives(source)).toBe(
      ':::{lecture-summary}\na\n:::\n\n:::{equation}\n$$ 1 + 1 $$\n:::\n',
    );
  });
});
