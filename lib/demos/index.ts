/**
 * Marimo interactive-demo pipeline (MVP4) public API. SERVER-ONLY surface
 * (actions/embed touch Supabase server clients) — never import from a
 * 'use client' component. The pure `directiveSnippet` helper lives in
 * ./snippet and can be imported there directly by client/UI/test code.
 */
export type { DemoApp, DemoEmbed, DemoStatus } from './types';
export { DEMO_STATUSES } from './types';
export { directiveSnippet } from './snippet';
export { resolveDemoEmbed } from './embed';
export {
  createDemoApp,
  queueDemoBuild,
  getDemoApp,
  listDemoApps,
  type ActionResult,
  type CreateDemoAppInput,
} from './actions';
