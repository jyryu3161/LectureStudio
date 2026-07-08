/**
 * SERVER-ONLY. Resolves an interactive-demo app id to its public iframe embed
 * for the renderer (components/blocks/interactive-demo.tsx).
 *
 * Uses a trusted service-role client (bypasses RLS, same pattern as
 * lib/ai/settings.ts) because the renderer must resolve a READY demo for
 * ANY viewer — including students, who cannot read `marimo_apps` under RLS.
 * This is safe: the only thing returned is the demo's app-proxy bundle URL and
 * its display name — no source, no secrets. Never construct this client in
 * client/RSC-serialized data paths beyond returning the plain DemoEmbed below.
 *
 * EMBED URL: points at the /api/demos/<appId>/… proxy route (app/api/demos),
 * NOT the raw Storage public URL. Storage serves the bundle's index.html as
 * `text/plain`, which makes a sandboxed iframe show the HTML as source instead
 * of running the demo; the proxy re-serves it as `text/html`. The iframe keeps
 * `sandbox` without `allow-same-origin`, so the proxy being same-origin to the
 * app grants the untrusted demo no access to app cookies/storage.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types';

import type { DemoEmbed } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('demos: missing Supabase service-role configuration on the server.');
  }
  return createServiceClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Returns the public embed for a demo iff it is `ready` with an uploaded
 * bundle; otherwise `null` (unknown id, not built yet, or failed) so the
 * renderer shows a "데모 준비 중" placeholder. Never throws for a malformed id.
 */
export async function resolveDemoEmbed(appId: string): Promise<DemoEmbed | null> {
  const id = appId.trim();
  if (!UUID_RE.test(id)) return null;

  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('marimo_apps')
    .select('name, status, bundle_path')
    .eq('id', id)
    .maybeSingle();

  if (error || !data || data.status !== 'ready' || !data.bundle_path) return null;

  // Serve through the app proxy (correct Content-Type) rather than the raw
  // Storage public URL. bundle_path is `<appId>/index.html`; relative asset
  // URLs in the bundle then resolve back through /api/demos/<appId>/… too.
  return { url: `/api/demos/${data.bundle_path}`, name: data.name };
}
