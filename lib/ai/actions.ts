'use server';

/**
 * Server Actions surface for the AI assistant — the client-callable entry
 * points the settings/authoring UI wires to forms and buttons.
 *
 * SECURITY: deliberately NEVER re-exports getActiveProviderConfig or any
 * function that returns a raw API key. Everything here returns either a clean
 * result object or non-secret data. Admin/course-role gating lives in the
 * underlying settings.ts / artifacts.ts functions (defense in depth with RLS).
 */
import {
  approveArtifact,
  discardArtifact,
  generateArtifact,
  type AiArtifact,
  type GenerateArtifactInput,
} from './artifacts';
import {
  setActiveProvider as setActiveProviderImpl,
  testProvider as testProviderImpl,
  upsertProviderKey as upsertProviderKeyImpl,
} from './settings';
import type { ProviderId, ProviderTestResult } from './types';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export async function generateArtifactAction(
  input: GenerateArtifactInput,
): Promise<ActionResult<AiArtifact>> {
  try {
    return { ok: true, data: await generateArtifact(input) };
  } catch (error) {
    return fail(error);
  }
}

export async function approveArtifactAction(id: string): Promise<ActionResult<AiArtifact>> {
  try {
    return { ok: true, data: await approveArtifact(id, { position: 'end' }) };
  } catch (error) {
    return fail(error);
  }
}

export async function discardArtifactAction(id: string): Promise<ActionResult<AiArtifact>> {
  try {
    return { ok: true, data: await discardArtifact(id) };
  } catch (error) {
    return fail(error);
  }
}

export async function setActiveProviderAction(
  provider: ProviderId,
): Promise<ActionResult<null>> {
  try {
    await setActiveProviderImpl(provider);
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function upsertProviderKeyAction(input: {
  provider: ProviderId;
  apiKey: string;
  model?: string | null;
}): Promise<ActionResult<null>> {
  try {
    await upsertProviderKeyImpl(input);
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function testProviderAction(
  provider: ProviderId,
): Promise<ActionResult<ProviderTestResult>> {
  try {
    return { ok: true, data: await testProviderImpl(provider) };
  } catch (error) {
    return fail(error);
  }
}
