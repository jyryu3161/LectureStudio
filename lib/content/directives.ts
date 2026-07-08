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
export const VIDEO_DIRECTIVE = 'video';
export const INTERACTIVE_DEMO_DIRECTIVE = 'interactive-demo';

/** AST node `type` values produced by the directives above (see blocks.ts). */
export const LECTURE_SUMMARY_NODE = 'lectureSummary';
export const STUDENT_DETAIL_NODE = 'studentDetail';
export const INSTRUCTOR_NOTE_NODE = 'instructorNote';
export const EQUATION_NODE = 'equation';
export const VIDEO_NODE = 'video';
export const INTERACTIVE_DEMO_NODE = 'interactiveDemo';

/**
 * `:::{interactive-demo} <appId>` (MVP4, PRD §4.7 / §5.5). The directive
 * argument is the id of a `marimo_apps` row (see lib/demos); the body, if
 * any, is an optional caption parsed as MyST (same as the other wrappers).
 * The resolved app id is carried on the node as `appId` so
 * `deriveBlockMetadata` (blocks.ts) can persist it to content_blocks.metadata
 * and the renderer (components/blocks/interactive-demo.tsx) can resolve it to
 * the public WASM-bundle iframe URL. Returns exactly one node (the
 * one-top-level-node = one Block rule), like the wrappers above.
 */
function interactiveDemoDirective(): DirectiveSpec {
  return {
    name: INTERACTIVE_DEMO_DIRECTIVE,
    arg: { type: String },
    body: { type: 'myst' },
    run(data): GenericNode[] {
      const children = Array.isArray(data.body) ? data.body : [];
      const appId = typeof data.arg === 'string' ? data.arg.trim() : '';
      return [{ type: INTERACTIVE_DEMO_NODE, appId, children }];
    },
  };
}

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
 *  - `video` registers a real (but still stub-rendered) directive so a
 *    chapter can author a `:::{video} ... :::` block that classifies as
 *    blockType 'video' (rendered by the ComingSoonBlock placeholder for
 *    now, PRD §4.7) instead of failing as an unknown directive. Its body is
 *    parsed as MyST (caption/label) exactly like the other wrappers.
 *
 * `interactive-demo` is now a real directive (MVP4) that parses its `<appId>`
 * argument into the block (see interactiveDemoDirective above). `animation` /
 * `quiz` remain stub-only (PRD §4.7) — no authoring syntax yet, so no
 * directive is registered for them. blockTypeOf()'s fallback keeps parsing
 * them gracefully (as `paragraph`) if an unknown directive with one of those
 * names shows up anyway; wiring real directives for them is a small, additive
 * follow-up.
 */
export const customDirectives: DirectiveSpec[] = [
  wrapperDirective(LECTURE_SUMMARY_DIRECTIVE, LECTURE_SUMMARY_NODE),
  wrapperDirective(STUDENT_DETAIL_DIRECTIVE, STUDENT_DETAIL_NODE),
  wrapperDirective(INSTRUCTOR_NOTE_DIRECTIVE, INSTRUCTOR_NOTE_NODE),
  wrapperDirective(EQUATION_DIRECTIVE, EQUATION_NODE),
  wrapperDirective(VIDEO_DIRECTIVE, VIDEO_NODE),
  interactiveDemoDirective(),
];
