import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ensureStableIds } from '@/lib/content';
import { renderBlocks } from '@/lib/render';

/**
 * End-to-end check with the real MyST parser (lib/content), not just
 * hand-built Block fixtures -- confirms `renderBlocks` actually handles
 * every block shape `ensureStableIds` produces from source shaped like the
 * committed seed chapter (supabase/seed.sql): heading, lecture-summary,
 * student-detail, instructor-note, inline + block equations, code, and a
 * figure, and that KaTeX/Shiki both actually run.
 */
const SOURCE = `# 03장 · 병합 정렬(Merge Sort)

:::lecture-summary
병합 정렬은 배열을 절반씩 나누어 각각 정렬한 뒤 다시 병합하는 분할 정복 알고리즘이다.
:::

:::student-detail
정렬되지 않은 배열을 더 이상 나눌 수 없을 때까지 절반으로 쪼갠 다음 병합한다.
:::

:::instructor-note
학생들에게 "왜 최악의 경우에도 O(n log n)이 보장되는가?"를 먼저 질문한다.
:::

## 점화식과 시간 복잡도

실행 시간은 다음 점화식으로 표현되며, 마스터 정리에 의해 $O(n \\log n)$이 된다.

:::equation
$$ T(n) = 2\\,T\\!\\left(\\frac{n}{2}\\right) + \\Theta(n) $$
:::

## 파이썬 구현

\`\`\`python
def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    return merge(merge_sort(a[:mid]), merge_sort(a[mid:]))
\`\`\`

![PCA scatter plot of the first two components](https://example.com/fig.png "Figure title")
`;

async function renderSource(role: 'student' | 'author') {
  const { blocks } = ensureStableIds(SOURCE);
  const elements = await renderBlocks(blocks, { role });
  const html = renderToStaticMarkup(createElement(Fragment, null, elements));
  return { blocks, elements, html };
}

describe('renderBlocks integration (real MyST parse -> render -> HTML)', () => {
  it('recognizes every seed-like block type', async () => {
    const { blocks } = await renderSource('author');
    expect(blocks.map((b) => b.blockType)).toEqual([
      'heading',
      'lecture-summary',
      'student-detail',
      'instructor-note',
      'heading',
      'paragraph',
      'equation',
      'heading',
      'code',
      'figure',
    ]);
  });

  it('strips instructor-note for a student while rendering everything else correctly', async () => {
    const { blocks, elements, html } = await renderSource('student');
    const instructorBlock = blocks.find((b) => b.blockType === 'instructor-note')!;

    expect(elements).toHaveLength(blocks.length - 1);
    expect(html).not.toContain('최악의 경우');
    expect(html).not.toContain(instructorBlock.id);

    // Every surviving block carries its stable-id marker attributes (PRD §5.3).
    for (const block of blocks) {
      if (block.id === instructorBlock.id) continue;
      expect(html).toContain(`data-block-id="${block.id}"`);
      expect(html).toContain(`data-content-hash="${block.contentHash}"`);
    }

    expect(html).toContain('katex'); // inline $...$ and :::equation both ran
    expect(html).toContain('shiki'); // Shiki actually highlighted the code block
    expect(html).toContain('merge_sort');
    expect(html).toContain('alt="PCA scatter plot of the first two components"');
  });

  it('includes instructor-note content for an author', async () => {
    const { blocks, elements, html } = await renderSource('author');

    expect(elements).toHaveLength(blocks.length);
    expect(html).toContain('최악의 경우');
  });
});
