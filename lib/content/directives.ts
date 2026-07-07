import type { DirectiveSpec, GenericNode } from 'myst-common';

/**
 * PRD §5.5 custom colon-fence directives. Each one just parses its body as
 * regular MyST content and wraps it in a single node of `nodeType` — this
 * mirrors how myst-directives' own `admonition`/`figure` directives work
 * (see node_modules/myst-directives/dist/admonition.js), so we get the same
 * behavior (nested markdown, math, etc. inside the block) for free instead
 * of reimplementing body parsing.
 *
 * `run()` always returns exactly one node so that after
 * `liftMystDirectivesAndRolesTransform` there is still exactly one top-level
 * AST node per directive — required by the "one top-level node = one Block"
 * rule in blocks.ts.
 *
 * Position: the directive's own `data.node.position` (set by myst-parser,
 * spanning the whole `:::{name} ... :::` fence) is copied onto the returned
 * node in parse.ts's `backfillDirectivePositions` step, since myst-transforms'
 * lift step does not carry position over from the wrapper on its own
 * (verified against node_modules/myst-common/dist/utils.js `liftChildren`).
 */
function wrapperDirective(name: string, nodeType: string): DirectiveSpec {
  return {
    name,
    body: { type: 'myst' },
    run(data): GenericNode[] {
      const children = Array.isArray(data.body) ? data.body : [];
      return [{ type: nodeType, children }];
    },
  };
}

export const LECTURE_SUMMARY_DIRECTIVE = 'lecture-summary';
export const STUDENT_DETAIL_DIRECTIVE = 'student-detail';
export const INSTRUCTOR_NOTE_DIRECTIVE = 'instructor-note';
export const EQUATION_DIRECTIVE = 'equation';

/** AST node `type` values produced by the directives above (see blocks.ts). */
export const LECTURE_SUMMARY_NODE = 'lectureSummary';
export const STUDENT_DETAIL_NODE = 'studentDetail';
export const INSTRUCTOR_NOTE_NODE = 'instructorNote';
export const EQUATION_NODE = 'equation';

/**
 * Custom directive specs merged into myst-parser's defaults (figure, code,
 * admonition, ...) in parse.ts. Only the directives with no natural bare
 * MyST/mdast equivalent are registered here:
 *  - lecture-summary / student-detail / instructor-note: PRD-specific
 *    block types with no standard MyST directive.
 *  - equation: PRD §5.5 calls for an `equation` block type; authors can
 *    also just write bare `$$ ... $$` (a standard mdast `math` node, mapped
 *    to blockType 'equation' in blocks.ts) but the seed content and PRD
 *    §5.4 examples wrap it in `:::equation ... :::`, so we accept that too.
 *
 * `video` / `animation` / `interactive-demo` / `quiz` are stub-only for
 * MVP0 (PRD §4.7) — no authoring syntax yet, so no directive is registered
 * for them. blockTypeOf()'s fallback keeps parsing them gracefully (as
 * `paragraph`) if an unknown directive with one of those names shows up
 * anyway; wiring real directives for them is a small, additive follow-up.
 */
export const customDirectives: DirectiveSpec[] = [
  wrapperDirective(LECTURE_SUMMARY_DIRECTIVE, LECTURE_SUMMARY_NODE),
  wrapperDirective(STUDENT_DETAIL_DIRECTIVE, STUDENT_DETAIL_NODE),
  wrapperDirective(INSTRUCTOR_NOTE_DIRECTIVE, INSTRUCTOR_NOTE_NODE),
  wrapperDirective(EQUATION_DIRECTIVE, EQUATION_NODE),
];
