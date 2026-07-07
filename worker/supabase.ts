/**
 * Service-role Supabase client for the worker. TRUSTED server-side path:
 * bypasses RLS by design (same stance as scripts/ingest-seed.ts and the AI
 * key reads in lib/ai/settings.ts). This client must NEVER be constructed in
 * Next.js client/RSC code — only here, in the out-of-process worker.
 */
import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';

import type { Database } from '../lib/supabase/types';

import { getWorkerEnv } from './env';

export type WorkerClient = SupabaseClient<Database>;

export function createWorkerClient(): WorkerClient {
  const { url, serviceRoleKey } = getWorkerEnv();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // The worker only ever makes REST/RPC calls — it never opens a Realtime
    // channel. supabase-js still constructs a RealtimeClient eagerly inside
    // createClient(), which on Node < 22 (no native WebSocket) throws
    // "Node.js 20 detected without native WebSocket support" from its
    // websocket-factory. Supplying any non-null `transport` short-circuits
    // that probe (RealtimeClient `_initializeOptions`:
    // `options?.transport ?? getWebSocketConstructor()`) — the class is never
    // instantiated since nothing here connects. Same dependency-free
    // workaround as scripts/ingest-seed.ts and scripts/dev-users.ts, so
    // `npm run worker` starts clean on plain Node 20 with no NODE_OPTIONS.
    realtime: {
      transport: class NoopSocketNeverUsed {},
    } as unknown as SupabaseClientOptions<'public'>['realtime'],
  });
}
