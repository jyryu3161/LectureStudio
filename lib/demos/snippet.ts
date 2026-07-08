/**
 * Pure, dependency-free helper: the MyST authoring snippet that embeds a
 * marimo demo by id. Kept in its own module (no server/DB imports) so the
 * authoring UI and unit tests can use it without pulling in server code.
 *
 * Matches the `:::{interactive-demo} <appId>` directive parsed in
 * lib/content/directives.ts.
 */
export function directiveSnippet(appId: string): string {
  return `:::{interactive-demo} ${appId}\n:::`;
}
