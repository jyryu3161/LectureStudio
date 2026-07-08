import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/demos/[appId]/[[...path]]/route';

const APP_ID = '11111111-2222-3333-4444-555555555555';

/** Build the route's second arg (Next passes params as a Promise). */
function ctx(appId: string, path?: string[]) {
  return { params: Promise.resolve({ appId, path }) };
}

describe('GET /api/demos/[appId]/[[...path]] response headers', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    // Upstream storage returns the object body; the route re-heads it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html><title>demo</title>', { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sets Access-Control-Allow-Origin so a sandboxed (opaque-origin) iframe can load module scripts', async () => {
    // REGRESSION GUARD (MVP4 blocker): the demo iframe is sandboxed WITHOUT
    // allow-same-origin, so its document has an opaque 'null' origin and the
    // marimo bundle's <script type="module"> / crossorigin assets are fetched
    // in CORS mode. Without this header the browser blocks them and the demo
    // never boots. Do NOT remove.
    const res = await GET(new Request('http://localhost/api/demos/' + APP_ID), ctx(APP_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('serves the entry document as text/html (not the storage endpoint text/plain)', async () => {
    const res = await GET(new Request('http://localhost/api/demos/' + APP_ID), ctx(APP_ID));
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('maps asset extensions and still sets the CORS header on assets', async () => {
    const res = await GET(
      new Request('http://localhost/api/demos/' + APP_ID + '/assets/app.js'),
      ctx(APP_ID, ['assets', 'app.js']),
    );
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('404s a non-UUID appId without touching upstream (no CORS leak on the guard path)', async () => {
    const res = await GET(new Request('http://localhost/api/demos/not-a-uuid'), ctx('not-a-uuid'));
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('404s a path-traversal segment', async () => {
    const res = await GET(
      new Request('http://localhost/api/demos/' + APP_ID + '/..'),
      ctx(APP_ID, ['..']),
    );
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
