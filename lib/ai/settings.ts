/**
 * AI settings & provider-key access — SERVER ONLY (imports next/headers via
 * lib/supabase/server; never import from a Client Component).
 *
 * SECURITY (non-negotiable, PRD §9 / AI CONTRACT):
 *  - Raw API keys live only in ai_provider_keys and are read only here, in
 *    server code. They are NEVER returned to the client: getActiveProviderConfig
 *    is the only function that exposes a raw key and it is used solely to feed a
 *    provider's generate() on the server. The settings UI must use
 *    listProviderKeysMasked() (masked, last-4 only).
 *  - All mutating/testing operations are gated on app_admins membership, verified
 *    in code (requireAppAdmin) AND enforced again by RLS on the tables.
 *
 * Key reads use a trusted service-role client: an author who can generate need
 * not be a platform admin, but ai_provider_keys is admin-only under RLS. Reading
 * the key server-side with the service role is the intended trusted path (the key
 * still never leaves the server), mirroring the course-bootstrap/ingest pattern.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

import { getProvider } from './registry';
import type {
  ArtifactKind,
  ProviderConfig,
  ProviderId,
  ProviderTestResult,
} from './types';
import { PROVIDER_IDS } from './types';

export interface AiSettings {
  activeProvider: ProviderId;
  updatedAt: string | null;
}

export interface ActiveProviderConfig {
  provider: ProviderId;
  apiKey: string | null;
  model: string;
}

export interface ProviderKeyMeta {
  provider: ProviderId;
  /** Masked key for display, e.g. '••••1234'. Null when no key stored. */
  maskedKey: string | null;
  model: string | null;
  hasKey: boolean;
  updatedAt: string | null;
}

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

/** '••••1234' from a raw key; never reveals more than the last 4 chars. */
function maskKey(rawKey: string): string {
  const last4 = rawKey.slice(-4);
  return `••••${last4}`;
}

/**
 * A trusted service-role client for reading secrets (ai_provider_keys) in
 * server code. Bypasses RLS by design — used only after the caller's course
 * role / admin status has already been verified. Never handed to the client.
 */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('AI settings: missing Supabase service-role configuration on the server.');
  }
  return createServiceClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Reads the singleton ai_settings row (RLS: any authenticated user). */
export async function getAiSettings(): Promise<AiSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ai_settings')
    .select('active_provider, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data || !isProviderId(data.active_provider)) {
    // Fail safe to the offline mock provider rather than erroring the whole app.
    return { activeProvider: 'mock', updatedAt: null };
  }
  return { activeProvider: data.active_provider, updatedAt: data.updated_at };
}

/**
 * Resolves the config for the currently active provider: {provider, apiKey|null,
 * model}. For mock, apiKey is null. For anthropic/gemini, the key+model are read
 * with the service-role client (see module note); model falls back to the
 * provider default when unset.
 */
export async function getActiveProviderConfig(): Promise<ActiveProviderConfig> {
  const { activeProvider } = await getAiSettings();
  const provider = getProvider(activeProvider);

  if (activeProvider === 'mock') {
    return { provider: 'mock', apiKey: null, model: provider.defaultModel };
  }

  const { data, error } = await serviceClient()
    .from('ai_provider_keys')
    .select('api_key, model')
    .eq('provider', activeProvider)
    .maybeSingle();

  if (error) {
    throw new Error(`AI settings: failed to read provider key: ${error.message}`);
  }

  return {
    provider: activeProvider,
    apiKey: data?.api_key ?? null,
    model: data?.model || provider.defaultModel,
  };
}

/** Throws unless the current user is a platform admin (app_admins row). */
async function requireAppAdmin(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('You must be signed in.');
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('app_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    throw new Error(`AI settings: admin check failed: ${error.message}`);
  }
  if (!data) {
    throw new Error('Only a platform admin can change AI settings.');
  }
  return user.id;
}

/** Switches the active provider (admin-only). */
export async function setActiveProvider(provider: ProviderId): Promise<void> {
  await requireAppAdmin();
  if (!isProviderId(provider)) {
    throw new Error(`Unknown provider: ${String(provider)}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('ai_settings')
    .update({ active_provider: provider, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) {
    throw new Error(`AI settings: failed to set active provider: ${error.message}`);
  }
}

/** Stores/updates a provider's API key + optional model (admin-only). */
export async function upsertProviderKey(input: {
  provider: ProviderId;
  apiKey: string;
  model?: string | null;
}): Promise<void> {
  await requireAppAdmin();
  const { provider, apiKey, model } = input;
  if (provider !== 'anthropic' && provider !== 'gemini') {
    throw new Error(`Provider "${String(provider)}" does not take an API key.`);
  }
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('API key must be a non-empty string.');
  }
  const supabase = await createClient();
  const { error } = await supabase.from('ai_provider_keys').upsert(
    {
      provider,
      api_key: apiKey.trim(),
      model: model?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider' },
  );
  if (error) {
    throw new Error(`AI settings: failed to save provider key: ${error.message}`);
  }
}

/** Masked view of stored provider keys for the settings UI (admin-only). */
export async function listProviderKeysMasked(): Promise<ProviderKeyMeta[]> {
  await requireAppAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ai_provider_keys')
    .select('provider, api_key, model, updated_at');
  if (error) {
    throw new Error(`AI settings: failed to read provider keys: ${error.message}`);
  }

  const byProvider = new Map(
    (data ?? []).map((row) => [row.provider, row] as const),
  );

  return (['anthropic', 'gemini'] as const).map((provider) => {
    const row = byProvider.get(provider);
    const rawKey = row?.api_key;
    return {
      provider,
      maskedKey: rawKey ? maskKey(rawKey) : null,
      model: row?.model ?? null,
      hasKey: Boolean(rawKey),
      updatedAt: row?.updated_at ?? null,
    };
  });
}

/**
 * Runs a 1-line 'ping' generation through `provider` to verify connectivity
 * (admin-only). Mock is always ok. Errors map to a clean {ok:false, message}.
 */
export async function testProvider(providerId: ProviderId): Promise<ProviderTestResult> {
  await requireAppAdmin();
  if (!isProviderId(providerId)) {
    return { ok: false, message: `Unknown provider: ${String(providerId)}` };
  }

  const provider = getProvider(providerId);

  let cfg: ProviderConfig;
  if (providerId === 'mock') {
    cfg = { apiKey: null, model: provider.defaultModel };
  } else {
    const { data, error } = await serviceClient()
      .from('ai_provider_keys')
      .select('api_key, model')
      .eq('provider', providerId)
      .maybeSingle();
    if (error) {
      return { ok: false, message: `Could not read stored key: ${error.message}` };
    }
    if (!data?.api_key) {
      return { ok: false, message: 'No API key stored for this provider yet.' };
    }
    cfg = { apiKey: data.api_key, model: data.model || provider.defaultModel };
  }

  const kind: ArtifactKind = 'student-explanation';
  try {
    const out = await provider.generate(
      {
        kind,
        instruction: 'ping',
        context: {
          courseTitle: 'Connectivity check',
          chapterTitle: 'ping',
          chapterSource: 'ping',
        },
      },
      cfg,
    );
    return {
      ok: out.trim().length > 0,
      message: out.trim().length > 0 ? 'Connection OK.' : 'Provider returned an empty response.',
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Provider test failed.' };
  }
}
