/**
 * SERVER-ONLY rendering helper: turns raw LaTeX (as authored -- never HTML)
 * into KaTeX markup for `dangerouslySetInnerHTML`.
 *
 * `katex/dist/katex.min.css` is imported once, globally, in app/layout.tsx
 * (outside this workstream's ownership) -- this module only produces markup
 * that assumes that stylesheet is present on the page.
 */
import katex from 'katex';

/**
 * Renders `value` to a KaTeX HTML+MathML string. This is KaTeX's documented
 * safe-for-untrusted-input path:
 *  - `trust: false` (the default, set explicitly for clarity) refuses
 *    `\href`/`\url`/`\includegraphics`/`\html*` commands that could
 *    otherwise smuggle an arbitrary URL or inline style into the output --
 *    equation source comes from course authors, not a fully trusted origin.
 *  - `throwOnError: false` renders a visible, isolated error span instead of
 *    throwing: one malformed equation must not take down the whole chapter
 *    render (PRD §16.2 resilience).
 *  - `output: 'htmlAndMathml'` keeps a screen-reader-usable MathML tree
 *    alongside the visual HTML (PRD §16.4 accessibility).
 */
export function renderMath(value: string, displayMode: boolean): string {
  try {
    return katex.renderToString(value, {
      displayMode,
      throwOnError: false,
      trust: false,
      output: 'htmlAndMathml',
    });
  } catch {
    // Defensive only: throwOnError:false means katex itself shouldn't reach
    // here, but a render helper must never throw into the block tree.
    return `<code>${escapeHtml(value)}</code>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
