/**
 * SERVER-ONLY MODULE. This imports myst-parser/myst-transforms (ESM-only,
 * Node-oriented packages only listed in next.config.mjs `transpilePackages`
 * for server bundling). Only import this file from Server Components,
 * route handlers, server actions, or standalone scripts — never from a
 * 'use client' component. (The `server-only` guard package isn't part of
 * this project's dependencies, so this boundary is enforced by convention
 * and code review rather than a build-time throw.)
 */
import type { GenericNode, GenericParent } from 'myst-common';
import { fileWarn } from 'myst-common';
import { mystParse } from 'myst-parser';
import { liftMystDirectivesAndRolesTransform } from 'myst-transforms';
import { visit } from 'unist-util-visit';
import { VFile } from 'vfile';

import { customDirectives } from './directives';
import { normalizeBareDirectives } from './normalize';
import type { ParseResult, ParseWarning } from './types';

// Note: vfile-message splits a `source` string containing a colon into
// `.source`/`.ruleId` itself (see node_modules/vfile-message/lib/index.js),
// which is why myst's own fileWarn/fileError calls pass `source` and
// `ruleId` as two separate opts rather than one combined string.
const FIGURE_ALT_SOURCE = 'content-engine';
const FIGURE_ALT_RULE_ID = 'figure-alt-required';

/**
 * myst-transforms' liftMystDirectivesAndRolesTransform replaces each
 * `mystDirective` wrapper node with its own children (see
 * node_modules/myst-common/dist/utils.js `liftChildren`), but does not copy
 * the wrapper's `.position` onto them — so a directive-produced node (custom
 * ones from directives.ts, but also built-ins like `figure`/`admonition`)
 * would otherwise end up with no source position at all. That position is
 * required for stable-ids.ts's marker placement and content hashing, so
 * backfill it from the wrapper before lifting. Verified empirically against
 * this exact myst-parser/myst-transforms version pair.
 */
function backfillDirectivePositions(tree: GenericParent): void {
  visit(tree, 'mystDirective', (node: GenericNode) => {
    if (!node.position || !node.children) return;
    for (const child of node.children) {
      if (!child.position) {
        child.position = node.position;
      }
    }
  });
}

/** PRD §5.5: figures/images must have alt text — surfaced as a warning. */
function checkFigureAltText(tree: GenericParent, file: VFile): void {
  visit(tree, 'image', (node: GenericNode) => {
    const alt = typeof node.alt === 'string' ? node.alt.trim() : '';
    if (!alt) {
      fileWarn(file, 'figure/image is missing alt text (required for accessibility)', {
        node,
        source: FIGURE_ALT_SOURCE,
        ruleId: FIGURE_ALT_RULE_ID,
      });
    }
  });
}

/**
 * Parse MyST source into an mdast-based AST (server-only — never import
 * this from a 'use client' component). Recognizes the PRD custom
 * directives (lecture-summary/student-detail/instructor-note/equation, see
 * directives.ts) as typed nodes instead of unknown-directive errors, and
 * surfaces diagnostics (unknown directives, missing figure alt text) as
 * vfile messages.
 */
export function parseWithWarnings(source: string): ParseResult {
  const normalizedSource = normalizeBareDirectives(source);
  const file = new VFile({ value: normalizedSource });
  const tree = mystParse(normalizedSource, {
    vfile: file,
    directives: customDirectives,
  }) as GenericParent;

  backfillDirectivePositions(tree);
  liftMystDirectivesAndRolesTransform(tree);
  checkFigureAltText(tree, file);

  const warnings: ParseWarning[] = file.messages.map((message) => ({
    message: message.reason,
    line: message.line,
    column: message.column,
    fatal: message.fatal ?? null,
    ruleId: message.ruleId,
    source: message.source,
  }));

  return { tree, warnings };
}

/** Convenience wrapper for callers that only need the AST. */
export function parse(source: string): GenericParent {
  return parseWithWarnings(source).tree;
}
