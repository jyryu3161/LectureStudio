'use server';

/**
 * Server Actions surface for Runtime Studio + code execution — the
 * client-callable entry points the Runtime Studio / reader UI wires to forms
 * and Run buttons.
 *
 * All authz (app_admin for runtime management, elevated course role +
 * server-verified block executability for runs) lives in ./db, which also
 * rides RLS. This file only adapts those throwing functions into a uniform
 * `ActionResult` for the client.
 */
import {
  createRuntime as createRuntimeImpl,
  getBuild as getBuildImpl,
  getExecution as getExecutionImpl,
  queueBuild as queueBuildImpl,
  queueExecution as queueExecutionImpl,
  updateRuntime as updateRuntimeImpl,
  type BuildRow,
  type ExecutionRow,
  type RuntimeRow,
} from './db';
import type { QueueExecutionInput, RuntimeConfigInput } from './types';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export async function createRuntimeAction(
  courseId: string,
  config: RuntimeConfigInput,
): Promise<ActionResult<RuntimeRow>> {
  try {
    return { ok: true, data: await createRuntimeImpl(courseId, config) };
  } catch (error) {
    return fail(error);
  }
}

export async function updateRuntimeAction(
  runtimeId: string,
  config: RuntimeConfigInput,
): Promise<ActionResult<RuntimeRow>> {
  try {
    return { ok: true, data: await updateRuntimeImpl(runtimeId, config) };
  } catch (error) {
    return fail(error);
  }
}

export async function queueBuildAction(runtimeId: string): Promise<ActionResult<string>> {
  try {
    return { ok: true, data: await queueBuildImpl(runtimeId) };
  } catch (error) {
    return fail(error);
  }
}

export async function getBuildAction(buildId: string): Promise<ActionResult<BuildRow | null>> {
  try {
    return { ok: true, data: await getBuildImpl(buildId) };
  } catch (error) {
    return fail(error);
  }
}

export async function queueExecutionAction(
  input: QueueExecutionInput,
): Promise<ActionResult<string>> {
  try {
    return { ok: true, data: await queueExecutionImpl(input) };
  } catch (error) {
    return fail(error);
  }
}

export async function getExecutionAction(
  executionId: string,
): Promise<ActionResult<ExecutionRow | null>> {
  try {
    return { ok: true, data: await getExecutionImpl(executionId) };
  } catch (error) {
    return fail(error);
  }
}
