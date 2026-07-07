import {
  EQUATION_DIRECTIVE,
  INSTRUCTOR_NOTE_DIRECTIVE,
  LECTURE_SUMMARY_DIRECTIVE,
  STUDENT_DETAIL_DIRECTIVE,
} from './directives';

/**
 * Real MyST (markdown-it-myst's `replaceFences`, see
 * node_modules/markdown-it-myst/dist/directives.js) only recognizes a
 * colon-fence as a directive when the name is wrapped in curly braces —
 * `:::{instructor-note}`. A bare `:::instructor-note` (no braces) parses as
 * an ordinary fenced *code* block instead (verified empirically), which
 * would silently classify instructor-only content as a public `code` block.
 *
 * The PRD (ref/final.md §5.5) and the committed seed chapter
 * (supabase/seed.sql) both use the bare form, though. Rather than reject
 * that content, normalize it to the canonical `{name}` form before parsing
 * — for our own known custom directive names only, and never inside a
 * fenced code sample (so a code snippet that happens to contain the literal
 * text ":::instructor-note" is left alone).
 */
const KNOWN_BARE_DIRECTIVE_NAMES = [
  LECTURE_SUMMARY_DIRECTIVE,
  STUDENT_DETAIL_DIRECTIVE,
  INSTRUCTOR_NOTE_DIRECTIVE,
  EQUATION_DIRECTIVE,
] as const;

const BARE_DIRECTIVE_RE = new RegExp(
  `^(:{3,})(${KNOWN_BARE_DIRECTIVE_NAMES.join('|')})(?=[ \\t]|$)`,
);

/** Matches a fenced-code-block delimiter line (open or close), e.g. ```py */
const BACKTICK_FENCE_LINE_RE = /^ {0,3}`{3,}/;

export function normalizeBareDirectives(source: string): string {
  const lines = source.split('\n');
  let inCodeFence = false;
  const normalized = lines.map((line) => {
    if (BACKTICK_FENCE_LINE_RE.test(line)) {
      inCodeFence = !inCodeFence;
      return line;
    }
    if (inCodeFence) return line;
    return line.replace(
      BARE_DIRECTIVE_RE,
      (_match, colons: string, name: string) => `${colons}{${name}}`,
    );
  });
  return normalized.join('\n');
}
