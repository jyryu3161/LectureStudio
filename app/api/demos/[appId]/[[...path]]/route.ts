/**
 * GET /api/demos/<appId>/<...path> -- proxies a built marimo WASM bundle out of
 * the PUBLIC `demos` Storage bucket, setting a correct `Content-Type` (MVP4).
 *
 * WHY THIS EXISTS: Supabase's storage public endpoint deliberately serves
 * `.html` objects as `text/plain`, so a sandboxed iframe pointed straight at the
 * storage URL renders the bundle's HTML as source text and the demo never boots
 * (no Pyodide, no interaction). This route streams the same object back with the
 * right type (`text/html` for the entry document, extension-mapped for assets),
 * so the iframe runs the notebook client-side.
 *
 * SECURITY: the iframe embedding this route keeps
 * `sandbox="allow-scripts allow-downloads"` (NO `allow-same-origin`) -- the
 * sandbox forces the document into an opaque origin regardless of this route
 * being same-origin to the app, so the untrusted demo still cannot touch the
 * app's cookies/storage or same-origin endpoints. This proxy grants no access
 * beyond the already-PUBLIC bucket: `appId` must be a UUID and every path
 * segment is validated to block traversal, and it only ever reads `demos/`.
 *
 * OPAQUE-ORIGIN WORKER SHIM: marimo boots its Pyodide runtime in a *module*
 * Worker constructed from an http(s) URL (`new Worker(new URL('worker-*.js',
 * import.meta.url), {type:'module'})`). An opaque-origin document (our sandbox,
 * correctly, omits `allow-same-origin`) may NOT construct a Worker from an
 * http(s) script URL — the browser throws a SecurityError before any fetch, so
 * the ACAO:* header below (which only unblocks module-script *fetches*) cannot
 * help. Fix without weakening the sandbox: into the ENTRY HTML document we
 * inject a tiny classic script that wraps `window.Worker` so the worker is
 * built from a `blob:` bootstrap, which inherits the document's origin and is
 * therefore allowed to construct.
 *
 * The twist is that a `blob:` from an opaque origin is `blob:null`, and Chromium
 * refuses to RUN a `type:'module'` worker from a `blob:null` URL (verified: the
 * worker object is created but its code never executes — zero network requests,
 * demo stuck at "Initializing…"). A *classic* `blob:null` worker, however, runs
 * fine. So the bootstrap builds a CLASSIC worker and pulls marimo's worker in as
 * a module via dynamic `import()` (dynamic import loads ES modules even inside a
 * classic worker): it `fetch`es the worker source (cross-origin `fetch` IS
 * allowed from an opaque origin — Origin: null + ACAO:* above, unlike a
 * cross-origin module import) and `import()`s it through an inner *same-origin*
 * blob. marimo's worker refuses to run in a classic scope (`throw "Classic web
 * workers are not supported"`) — but that guard is a lone `importScripts` probe,
 * so the bootstrap first neuters `self.importScripts`; the worker bundle never
 * otherwise uses it, uses absolute CDN URLs for every runtime asset, and reads
 * neither `import.meta.url` nor `self.location`, so nothing else is affected.
 *
 * OPAQUE-ORIGIN ENV SHIM (see ./env-shim.ts): the same missing
 * `allow-same-origin` that forces the opaque origin also makes `localStorage`,
 * `sessionStorage` AND `indexedDB` THROW on any access. marimo reads
 * localStorage during its first React render (uncaught → boot aborts before the
 * Worker is even built), and its worker mounts an IndexedDB-backed Pyodide
 * filesystem (emscripten IDBFS) whose failed sync it treats as fatal
 * ("Something went wrong"). We run the env shim first — in the document AND,
 * re-injected via the Worker bootstrap, in the worker scope — to swap in
 * harmless in-memory Storage + IndexedDB only when the native ones throw. It is
 * ephemeral and per-context, shared with nothing: it removes crashes without
 * granting the untrusted demo real persistence or any cross-origin reach.
 */
import { extname } from 'node:path';

import { ENV_SHIM_SOURCE } from './env-shim';

// Streams from an external HTTP endpoint: force dynamic, Node runtime.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Extension → Content-Type, mirroring the types set at upload time
// (worker/demo.ts). `.html` is the whole point: it must be text/html, not the
// text/plain the storage public endpoint hands back.
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.data': 'application/octet-stream',
};

function contentTypeFor(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

// Storage/IndexedDB env shim (source string). Runs first in the document AND is
// re-exposed on `window.__lsEnvShim` so the Worker shim below can prepend the
// SAME source into the worker's own (also opaque-origin) global scope.
const ENV_SHIM_PRELUDE =
  `<script>window.__lsEnvShim=${JSON.stringify(ENV_SHIM_SOURCE)};try{new Function(window.__lsEnvShim)();}catch(e){}</script>`;

// Classic inline script injected at the top of the entry document's <head> so it
// runs (during parse) before the deferred module bundle constructs any Worker.
// It rewrites http(s) Worker script URLs to a CLASSIC `blob:` bootstrap that (1)
// installs the env shim in the worker scope, (2) neuters the worker's
// classic-context guard, then (3) dynamic-imports the real module worker source.
// See the module docblock for the full rationale (why a classic blob worker
// rather than the module worker marimo asks for, and why the env shim is needed
// in the worker too). Template literal → the embedded worker source needs no
// quote-escaping.
const WORKER_SHIM = `<script>(function(){var N=window.Worker;if(!N)return;function P(u,o){try{var a=new URL(u,document.baseURI);if(a.protocol==='http:'||a.protocol==='https:'){var j=JSON.stringify(a.href);var pre=(window.__lsEnvShim||'')+';';if(o&&o.type==='module'){var s=pre+'try{self.importScripts=function(){throw new Error("disabled")};}catch(e){}try{Object.defineProperty(self,"importScripts",{configurable:true,value:function(){throw new Error("disabled")}});}catch(e){}fetch('+j+').then(function(r){if(!r.ok)throw new Error("worker fetch "+r.status);return r.text()}).then(function(t){return import(URL.createObjectURL(new Blob([t],{type:"text/javascript"})))}).catch(function(e){setTimeout(function(){throw e},0)});';var b=URL.createObjectURL(new Blob([s],{type:"text/javascript"}));var no=o?Object.assign({},o):{};delete no.type;return new N(b,no);}var s2=pre+'importScripts('+j+');';var b2=URL.createObjectURL(new Blob([s2],{type:"text/javascript"}));return new N(b2,o);}}catch(e){}return new N(u,o);}P.prototype=N.prototype;window.Worker=P;})();</script>`;

// Prelude order matters: the env shim must run before the worker shim (and
// before any marimo module) so the very first render can read storage safely.
const HTML_PRELUDE = ENV_SHIM_PRELUDE + WORKER_SHIM;

/** Insert the boot prelude as the first child of <head> (falls back to prepend). */
function injectPrelude(html: string): string {
  const headOpen = /<head[^>]*>/i;
  if (headOpen.test(html)) {
    return html.replace(headOpen, (m) => m + HTML_PRELUDE);
  }
  return HTML_PRELUDE + html;
}

/** A path segment is safe iff it is a plain filename component. */
function isSafeSegment(seg: string): boolean {
  return seg.length > 0 && seg !== '.' && seg !== '..' && !/[\\/\0]/.test(seg);
}

/**
 * Wraps the upstream body in a stream that never lets a mid-transfer abort
 * become an uncaught error. A client disconnecting while a large demo asset is
 * still streaming (browser navigation, iframe teardown) otherwise surfaces as
 * `uncaughtException: [Error: aborted] ECONNRESET`, which can kill the Node
 * process under a plain `next start` deployment. Errors in either direction —
 * the upstream read failing, or the downstream consumer cancelling — are caught
 * and turned into a clean stream close / reader release.
 */
function guardStream(src: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = src.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => {});
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string; path?: string[] }> },
): Promise<Response> {
  const { appId, path } = await params;
  if (!UUID_RE.test(appId)) return new Response('Not found', { status: 404 });

  const segments = path ?? [];
  if (!segments.every(isSafeSegment)) return new Response('Not found', { status: 404 });
  // Empty path (e.g. `/api/demos/<id>` or trailing slash) → the entry document.
  const relPath = segments.length > 0 ? segments.join('/') : 'index.html';

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return new Response('Server misconfigured', { status: 500 });

  const upstream = `${base.replace(/\/$/, '')}/storage/v1/object/public/demos/${appId}/${relPath}`;
  // Tie the upstream fetch to the client's request lifetime so a client that
  // aborts mid-stream also tears down the upstream read (no orphaned pull).
  let res: Response;
  try {
    res = await fetch(upstream, { cache: 'no-store', signal: _request.signal });
  } catch {
    // Aborted before the upstream even responded (client went away), or the
    // upstream connection failed — either way, nothing to stream.
    if (_request.signal.aborted) return new Response(null, { status: 499 });
    return new Response('Bad gateway', { status: 502 });
  }
  if (!res.ok || !res.body) return new Response('Not found', { status: 404 });

  const contentType = contentTypeFor(relPath);
  // Only HTML documents (the bundle entry point) carry the marimo bootstrap that
  // constructs the Worker, so only they need the prelude. Buffer + inject for
  // HTML; stream everything else (assets can be large) through `guardStream` so
  // a mid-transfer client disconnect can't surface as an uncaught ECONNRESET.
  const isHtml = contentType.startsWith('text/html');
  const body = isHtml ? injectPrelude(await res.text()) : guardStream(res.body);

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      // Bundle assets are content-hashed; the entry document is cheap. Allow the
      // browser to cache within a session but always revalidate on rebuild.
      'cache-control': 'private, max-age=0, must-revalidate',
      'x-content-type-options': 'nosniff',
      // The embedding iframe is sandboxed WITHOUT allow-same-origin, so its
      // document has an opaque origin ('null'). The marimo bundle loads its JS as
      // <script type="module"> (fetched in CORS mode) plus crossorigin CSS/fonts;
      // without an ACAO header the browser blocks every one of those and the demo
      // never boots. Safe to open: the `demos` bucket is already PUBLIC and this
      // route is read-only (UUID + per-segment traversal guards, `demos/` only).
      'access-control-allow-origin': '*',
    },
  });
}
