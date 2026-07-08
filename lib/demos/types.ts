/**
 * Marimo interactive-demo types (MVP4). A demo is a marimo notebook (`source`)
 * exported to a self-contained WASM bundle in the public `demos` Storage
 * bucket; the renderer embeds it via a sandboxed iframe. Mirrors the
 * `marimo_apps` table (supabase/migrations/0005_demos.sql).
 */

export const DEMO_STATUSES = ['draft', 'building', 'ready', 'failed'] as const;
export type DemoStatus = (typeof DEMO_STATUSES)[number];

export interface DemoApp {
  id: string;
  courseId: string | null;
  name: string;
  source: string;
  status: DemoStatus;
  /** Bucket-relative key of the bundle entry (`<appId>/index.html`), or null. */
  bundlePath: string | null;
  log: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** What the renderer needs to embed a READY demo: a public URL + a title. */
export interface DemoEmbed {
  url: string;
  name: string;
}
